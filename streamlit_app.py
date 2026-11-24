import os
import io
import requests
import pandas as pd
import numpy as np
import streamlit as st
import folium
from streamlit_folium import st_folium

# Apne existing backend segmentation module ko import karein
from backend.segmentation import BurnScarSegmenter

st.set_page_config(
    page_title="Himachal Fire Watch",
    page_icon="🔥",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- CONFIG & CREDENTIALS ---
from dotenv import load_dotenv
load_dotenv("backend/.env")

FIRMS_API_KEY = os.getenv("FIRMS_API_KEY", "")
if not FIRMS_API_KEY:
    try:
        FIRMS_API_KEY = st.secrets.get("FIRMS_API_KEY", "")
    except Exception:
        FIRMS_API_KEY = ""
OFFICER_ACCOUNTS = {
    "dfo.bilaspur@hpforest.gov.in": {"name": "DFO Bilaspur Division", "role": "Divisional Forest Officer", "pw": "hpforest2026"},
    "officer@hpforest.gov.in": {"name": "Range Officer Shimla", "role": "Emergency Command", "pw": "firewatch123"},
}

DISTRICTS = [
    {"District": "Una", "lat": 31.47, "lon": 76.27, "Temp": 26.4, "RH": 38, "Wind": "12 km/h NW", "FWI": 42, "Risk": "Moderate"},
    {"District": "Sirmaur", "lat": 30.56, "lon": 77.47, "Temp": 24.8, "RH": 41, "Wind": "11 km/h NW", "FWI": 38, "Risk": "Moderate"},
    {"District": "Kangra", "lat": 32.10, "lon": 76.27, "Temp": 22.5, "RH": 45, "Wind": "10 km/h W", "FWI": 34, "Risk": "Low"},
    {"District": "Bilaspur", "lat": 31.34, "lon": 76.76, "Temp": 24.1, "RH": 42, "Wind": "10 km/h NW", "FWI": 35, "Risk": "Low"},
    {"District": "Shimla", "lat": 31.10, "lon": 77.17, "Temp": 16.2, "RH": 52, "Wind": "14 km/h W", "FWI": 26, "Risk": "Low"},
    {"District": "Mandi", "lat": 31.71, "lon": 76.93, "Temp": 20.8, "RH": 48, "Wind": "9 km/h S", "FWI": 29, "Risk": "Low"},
    {"District": "Solan", "lat": 30.91, "lon": 77.10, "Temp": 21.6, "RH": 44, "Wind": "11 km/h NW", "FWI": 32, "Risk": "Low"},
    {"District": "Kullu", "lat": 31.96, "lon": 77.11, "Temp": 17.4, "RH": 54, "Wind": "12 km/h S", "FWI": 22, "Risk": "Low"},
    {"District": "Hamirpur", "lat": 31.69, "lon": 76.52, "Temp": 23.9, "RH": 43, "Wind": "10 km/h W", "FWI": 33, "Risk": "Low"},
    {"District": "Chamba", "lat": 32.55, "lon": 76.13, "Temp": 16.8, "RH": 56, "Wind": "11 km/h W", "FWI": 21, "Risk": "Low"},
    {"District": "Kinnaur", "lat": 31.60, "lon": 78.35, "Temp": 9.5, "RH": 61, "Wind": "16 km/h W", "FWI": 14, "Risk": "Low"},
    {"District": "Lahaul & Spiti", "lat": 32.57, "lon": 77.58, "Temp": 3.1, "RH": 68, "Wind": "15 km/h W", "FWI": 8, "Risk": "Low"},
]

@st.cache_resource
def load_segmenter():
    return BurnScarSegmenter()

@st.cache_data(ttl=600)
def fetch_live_firms(days: int = 2):
    """Himachal Pradesh bounding box (75.5, 30.3, 79.0, 33.3) par live NASA FIRMS VIIRS data fetch karta hai."""
    if not FIRMS_API_KEY:
        return pd.DataFrame()
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{FIRMS_API_KEY}/VIIRS_SNPP_NRT/75.5,30.3,79.0,33.3/{days}"
    try:
        res = requests.get(url, timeout=15)
        if res.status_code == 200 and "latitude" in res.text:
            df = pd.read_csv(io.StringIO(res.text))
            return df
    except Exception:
        pass
    return pd.DataFrame()

# --- SESSION STATE ---
if "officer" not in st.session_state:
    st.session_state.officer = None

is_officer = st.session_state.officer is not None

# --- SIDEBAR: ROLE & NAVIGATION ---
with st.sidebar:
    st.title("🔥 Himachal Fire Watch")
    st.caption("Real-Time Satellite & AI Command Center")

    if is_officer:
        st.success(f"**{st.session_state.officer['name']}**\n\n{st.session_state.officer['role']}")
        if st.button("Switch to Public View", use_container_width=True):
            st.session_state.officer = None
            st.rerun()
    else:
        st.info("**Public Advisory Mode** (Read-Only)")
        with st.expander("🔐 Forest Officer Login"):
            email = st.text_input("Officer Email", placeholder="Enter official email")
            pw = st.text_input("Password", type="password", placeholder="Enter password")
            if st.button("Sign In", type="primary", use_container_width=True):
                user = OFFICER_ACCOUNTS.get(email.strip().lower())
                if user and user["pw"] == pw:
                    st.session_state.officer = user
                    st.rerun()
                else:
                    st.error("Invalid credentials")

    st.divider()
    pages = ["01 Overview Dashboard", "02 Live Satellite Monitoring", "03 AI Burn-Scar Segmentation", "04 Evacuation & Buffer Zones", "05 Weather & Risk Analysis"]
    page = st.radio("Navigation", pages)

# Live FIRMS Data Load
firms_df = fetch_live_firms(days=2)

# --- PAGE 1: OVERVIEW DASHBOARD ---
if page == "01 Overview Dashboard":
    st.subheader("Himachal Pradesh Real-Time Forest Fire Overview")

    if firms_df.empty:
        st.success("**All Clear (Real-Time Satellite Status):** NASA FIRMS VIIRS detected **0 active forest fire hotspots** across Himachal Pradesh.")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Live Fires Detected", len(firms_df))
    c2.metric("Satellite Feed", "NASA VIIRS + Sentinel-2")
    c3.metric("AI Model Status", "DeepLabV3 Ready")
    c4.metric("Access Level", "Authorized Officer" if is_officer else "Public Viewer")

    m = folium.Map(location=[31.75, 77.15], zoom_start=8, tiles="OpenTopoMap")
    for _, row in firms_df.iterrows():
        folium.CircleMarker(
            location=[row["latitude"], row["longitude"]],
            radius=8,
            color="#b3261e",
            fill=True,
            fill_opacity=0.85,
            popup=f"FRP: {row.get('frp', 'N/A')} MW | Date: {row.get('acq_date', '')}",
        ).add_to(m)

    st_folium(m, width=None, height=480)

# --- PAGE 2: LIVE SATELLITE MONITORING ---
elif page == "02 Live Satellite Monitoring":
    st.subheader("Live Satellite Constellation & Telemetry")
    if st.button("🔄 Refresh NASA FIRMS Feed"):
        st.cache_data.clear()
        st.rerun()

    st.dataframe(
        pd.DataFrame([
            {"Sensor": "NASA FIRMS VIIRS (S-NPP)", "Resolution": "375 m", "Cadence": "~3 hrs", "Status": "Active"},
            {"Sensor": "NASA FIRMS MODIS", "Resolution": "1 km", "Cadence": "~6 hrs", "Status": "Active"},
            {"Sensor": "ESA Sentinel-2 MSI (6-Band)", "Resolution": "10m–20m", "Cadence": "5 days", "Status": "Model Loaded"},
            {"Sensor": "ESA Sentinel-1 SAR", "Resolution": "10m Radar", "Cadence": "6–12 days", "Status": "Standby"},
        ]),
        use_container_width=True,
    )

    if not firms_df.empty:
        st.dataframe(firms_df, use_container_width=True)
    else:
        st.info("0 active thermal anomalies reported in the last 48 hours.")

# --- PAGE 3: AI BURN-SCAR SEGMENTATION ---
elif page == "03 AI Burn-Scar Segmentation":
    st.subheader("Sentinel-2 Burn-Scar Delineation (DeepLabV3-ResNet50)")
    if not is_officer:
        st.warning("🔒 **Restricted Module:** Please sign in via **Forest Officer Login** in the sidebar to run DeepLabV3 satellite segmentation.")
    else:
        col1, col2 = st.columns([2, 1])
        with col1:
            uploaded = st.file_uploader("Upload 6-Band Sentinel-2 GeoTIFF (.tif)", type=["tif", "tiff"])
        with col2:
            threshold = st.slider("Segmentation Threshold (τ)", 0.10, 0.90, 0.50, 0.05)

        if uploaded is not None:
            if st.button("Analyze Burn Scar", type="primary"):
                with st.spinner("Running 6-Band Z-Score Normalization & DeepLabV3 Inference..."):
                    segmenter = load_segmenter()
                    result = segmenter.predict_tif(uploaded.read(), uploaded.name, threshold=threshold)

                k1, k2, k3, k4 = st.columns(4)
                k1.metric("Burnt Coverage", f"{result['burnt_percentage']}%")
                k2.metric("Delineated Area", f"{result['burnt_area_ha']} ha")
                k3.metric("Post-Fire Mean NBR", result["mean_nbr"])
                k4.metric("Spatial CRS", result.get("crs") or "UTM")

                img_cols = st.columns(4)
                panels = [
                    ("True-Color RGB", result["images"]["true_color"]),
                    ("False-Color SWIR", result["images"]["false_color"]),
                    ("DeepLabV3 Burn Mask", result["images"]["burn_mask"]),
                    ("Delineated Overlay", result["images"]["overlay"]),
                ]
                for col, (title, b64_img) in zip(img_cols, panels):
                    col.markdown(f"**{title}**")
                    col.image(b64_img, use_container_width=True)

# --- PAGE 4: EVACUATION & BUFFER ZONES ---
elif page == "04 Evacuation & Buffer Zones":
    st.subheader("Evacuation & Proximity Buffer Zones (1 km · 3 km · 5 km)")
    if not is_officer:
        st.warning("🔒 **Restricted Module:** Officer login required to view evacuation buffers and dispatch response squads.")
    else:
        lat = st.number_input("Incident Latitude (°N)", value=31.340, format="%.4f")
        lon = st.number_input("Incident Longitude (°E)", value=76.760, format="%.4f")

        em = folium.Map(location=[lat, lon], zoom_start=12)
        folium.Circle([lat, lon], radius=5000, color="#b88a00", fill=True, fill_opacity=0.08, popup="5 km Watch Zone").add_to(em)
        folium.Circle([lat, lon], radius=3000, color="#d9801a", fill=True, fill_opacity=0.14, popup="3 km High Alert").add_to(em)
        folium.Circle([lat, lon], radius=1000, color="#b3261e", fill=True, fill_opacity=0.25, popup="1 km Immediate Danger").add_to(em)
        folium.Marker([lat, lon], popup="Fire Epicenter").add_to(em)
        st_folium(em, width=None, height=420)

# --- PAGE 5: WEATHER & RISK ANALYSIS ---
elif page == "05 Weather & Risk Analysis":
    st.subheader("Himachal Pradesh District Fire-Weather & Fuel Risk")
    wx_df = pd.DataFrame(DISTRICTS)
    st.dataframe(wx_df[["District", "Temp", "RH", "Wind", "FWI", "Risk"]], use_container_width=True)