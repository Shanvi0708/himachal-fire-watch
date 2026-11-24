import os
import io
from datetime import datetime, timezone
import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

MAP_KEY = os.getenv("FIRMS_MAP_KEY")
HP_BBOX = "75.5,30.3,79.1,33.3"  # Himachal Pradesh bounding box (W, S, E, N)
SENSOR = "VIIRS_SNPP_NRT"
LOOKBACK_DAYS = 2


def fetch_firms_hotspots() -> None:
    if not MAP_KEY:
        raise EnvironmentError("FIRMS_MAP_KEY is not configured in the environment (.env).")

    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SENSOR}/{HP_BBOX}/{LOOKBACK_DAYS}"
    timestamp_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    print("=" * 68)
    print("NASA FIRMS ACTIVE THERMAL ANOMALY QUERY — HIMACHAL PRADESH")
    print("=" * 68)
    print(f"Query Timestamp : {timestamp_utc}")
    print(f"Sensor Source   : {SENSOR}")
    print(f"Spatial Bounds  : {HP_BBOX} (Lon/Lat)")
    print(f"Lookback Window : Past {LOOKBACK_DAYS} days")
    print("-" * 68)

    response = requests.get(url, timeout=20)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text))
    print(f"HTTP Status     : {response.status_code} OK")
    print(f"Records Found   : {len(df)} thermal hotspot(s)\n")

    if df.empty:
        print("Status: No active thermal anomalies detected within the specified window.")
    else:
        summary_cols = [
            "latitude", "longitude", "acq_date", "acq_time",
            "satellite", "confidence", "frp", "daynight"
        ]
        available_cols = [c for c in summary_cols if c in df.columns]
        print(df[available_cols].to_string(index=False))

    print("=" * 68)


if __name__ == "__main__":
    fetch_firms_hotspots()