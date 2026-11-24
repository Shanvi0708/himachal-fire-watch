import os
import io
from datetime import datetime
from typing import Optional
import pandas as pd
import requests
from fastapi import FastAPI,File, Query, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from dotenv import load_dotenv
from database import engine, init_db
from segmentation import segmenter
load_dotenv()

FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "")
HP_BBOX = "75.5,30.3,79.1,33.3"

app = FastAPI(title="Himachal Pradesh Forest Fire Monitoring API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    init_db()


def classify_severity(frp: float) -> str:
    if frp >= 50.0:
        return "High"
    if frp >= 15.0:
        return "Moderate"
    return "Low"


def assign_district(lat: float, lon: float) -> str:
    if 31.20 <= lat <= 31.60 and 76.45 <= lon <= 76.95:
        return "Bilaspur"
    if 31.50 <= lat <= 32.10 and 76.70 <= lon <= 77.40:
        return "Mandi"
    if 30.85 <= lat <= 31.45 and 77.00 <= lon <= 77.85:
        return "Shimla"
    return "Himachal Pradesh"


@app.get("/api/sources/status")
def sources_status():
    db_connected = False
    stored_count = 0
    try:
        with engine.connect() as conn:
            stored_count = conn.execute(text("SELECT COUNT(*) FROM incidents;")).scalar() or 0
            db_connected = True
    except Exception:
        db_connected = False

    return{
        "database": "connected" if db_connected else "disconnected",
        "nasa_firms": "authenticated" if bool(FIRMS_MAP_KEY) else "missing_key",
        "google_earth_engine": "pending_authorization",
        "detection_model": "loaded" if segmenter.loaded else "pending_weights",
        "total_incidents": stored_count
    }


@app.post("/api/sync/firms")
def sync_firms_hotspots(days: int = Query(2, ge=1, le=7)):
    if not FIRMS_MAP_KEY:
        raise HTTPException(status_code=500, detail="FIRMS_MAP_KEY not configured.")

    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/{HP_BBOX}/{days}"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()

    df = pd.read_csv(io.StringIO(resp.text))
    if df.empty:
        return {"status": "ok", "fetched": 0, "inserted": 0}

    inserted = 0
    with engine.begin() as conn:
        for _, row in df.iterrows():
            lat = float(row["latitude"])
            lon = float(row["longitude"])
            acq_date = str(row["acq_date"])
            acq_time = str(row["acq_time"]).zfill(4)
            dt_obj = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M")
            frp = float(row.get("frp", 0.0))
            conf = str(row.get("confidence", "nominal"))
            ext_id = f"VIIRS_{lat:.4f}_{lon:.4f}_{acq_date}_{acq_time}"

            res = conn.execute(text("""
                INSERT OR IGNORE INTO incidents (
                    external_id, lat, lon, district, detected_time,
                    severity, area_ha, confidence, frp, source, status
                )
                VALUES (
                    :ext_id, :lat, :lon, :district, :dt,
                    :severity, 0.0, :conf, :frp, 'NASA_FIRMS_VIIRS', 'Active'
                );
            """), {
                "ext_id": ext_id,
                "lat": lat,
                "lon": lon,
                "district": assign_district(lat, lon),
                "dt": dt_obj,
                "severity": classify_severity(frp),
                "conf": conf,
                "frp": frp
            })
            inserted += res.rowcount

    return {"status": "ok", "fetched": len(df), "inserted": inserted}


@app.get("/api/incidents")
def get_incidents(
    district: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500)
):
    conditions = ["1=1"]
    params = {"limit": limit}

    if district and district.lower() != "all":
        conditions.append("LOWER(district) = LOWER(:district)")
        params["district"] = district

    if severity and severity.lower() != "all":
        conditions.append("LOWER(severity) = LOWER(:severity)")
        params["severity"] = severity

    query = text(f"""
        SELECT id, external_id, lat, lon, district, detected_time,
               severity, area_ha, confidence, frp, source, status
        FROM incidents
        WHERE {" AND ".join(conditions)}
        ORDER BY detected_time DESC
        LIMIT :limit;
    """)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    return {"count": len(rows), "incidents": [dict(r) for r in rows]}
@app.post("/api/segment")
async def segment_burn_scar(
    file: UploadFile = File(...),
    threshold: float = Query(0.5, ge=0.05, le=0.95)
):
    if not file.filename.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="Only .tif or .tiff GeoTIFF files are supported.")

    try:
        file_bytes = await file.read()
        return segmenter.predict_tif(file_bytes, file.filename, threshold=threshold)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Segmentation inference failed: {exc}")
from pathlib import Path

SAMPLE_PATCHES_DIR = Path(__file__).resolve().parent / "sample_patches"

@app.get("/api/sample-patches")
def list_sample_patches():
    if not SAMPLE_PATCHES_DIR.exists():
        return {"patches": []}
    files = sorted([f.name for f in SAMPLE_PATCHES_DIR.glob("*.tif*")])
    return {"patches": files}

@app.post("/api/segment-sample/{patch_name}")
def segment_sample_patch(patch_name: str, threshold: float = Query(0.5, ge=0.05, le=0.95)):
    patch_path = (SAMPLE_PATCHES_DIR / patch_name).resolve()
    if patch_path.parent != SAMPLE_PATCHES_DIR.resolve() or not patch_path.exists():
        raise HTTPException(status_code=404, detail="Sample patch not found.")
    return segmenter.predict_tif(patch_path.read_bytes(), patch_path.name, threshold=threshold)  

from pydantic import BaseModel

class OfficerLoginRequest(BaseModel):
    officer_id: str
    password: str

OFFICER_ACCOUNTS = {
    "dfo.bilaspur@hpforest.gov.in": {
        "name": "DFO Bilaspur Division",
        "role": "Divisional Forest Officer",
        "password": "hpforest2026",
    },
    "officer@hpforest.gov.in": {
        "name": "Range Forest Officer (Shimla)",
        "role": "Emergency Command Officer",
        "password": "firewatch123",
    },
}

@app.post("/api/auth/login")
def officer_login(payload: OfficerLoginRequest):
    user = OFFICER_ACCOUNTS.get(payload.officer_id.strip().lower())
    if not user or user["password"] != payload.password:
        raise HTTPException(status_code=401, detail="Invalid Officer ID or Password.")
    return {
        "authenticated": True,
        "officer_id": payload.officer_id.strip().lower(),
        "name": user["name"],
        "role": user["role"],
    }  