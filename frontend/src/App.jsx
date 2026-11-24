import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from "react-leaflet";
import {
  Flame,
  RefreshCw,
  Upload,
  ScanSearch,
  CheckCircle2,
  AlertCircle,
  Satellite,
  Radio,
  ShieldAlert,
  Wind,
  Droplets,
  Thermometer,
  Lock,
  LogOut,
  Eye,
  UserCheck,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

const DISTRICTS = [
  { n: "Chamba", lat: 32.55, lon: 76.13, risk: 0.55 },
  { n: "Kangra", lat: 32.10, lon: 76.27, risk: 0.78 },
  { n: "Lahaul & Spiti", lat: 32.57, lon: 77.58, risk: 0.12 },
  { n: "Kullu", lat: 31.96, lon: 77.11, risk: 0.66 },
  { n: "Mandi", lat: 31.71, lon: 76.93, risk: 0.72 },
  { n: "Hamirpur", lat: 31.69, lon: 76.52, risk: 0.58 },
  { n: "Una", lat: 31.47, lon: 76.27, risk: 0.84 },
  { n: "Bilaspur", lat: 31.34, lon: 76.76, risk: 0.69 },
  { n: "Solan", lat: 30.91, lon: 77.10, risk: 0.74 },
  { n: "Sirmaur", lat: 30.56, lon: 77.47, risk: 0.81 },
  { n: "Shimla", lat: 31.10, lon: 77.17, risk: 0.77 },
  { n: "Kinnaur", lat: 31.60, lon: 78.35, risk: 0.20 },
];

const SATELLITE_FEEDS = [
  {
    name: "NASA FIRMS · VIIRS (S-NPP / NOAA-20)",
    band: "375m Thermal I-Band",
    cadence: "~3 hours over HP",
    purpose: "Active thermal fire hotspot detection",
    statusKey: "nasa_firms",
    freshness: "Fresh",
  },
  {
    name: "NASA FIRMS · MODIS (Terra / Aqua)",
    band: "1km Thermal IR",
    cadence: "~6 hours",
    purpose: "Wide-area regional thermal anomaly cross-check",
    statusKey: "nasa_firms",
    freshness: "Fresh",
  },
  {
    name: "ESA Sentinel-2 MSI (L2A)",
    band: "6-Band Optical + SWIR (10m–20m)",
    cadence: "5-day revisit",
    purpose: "DeepLabV3 burn-scar segmentation & NBR mapping",
    statusKey: "detection_model",
    freshness: "Ready",
  },
  {
    name: "ESA Sentinel-1 SAR (C-Band)",
    band: "VV / VH Dual-Pol Radar",
    cadence: "6–12 day revisit",
    purpose: "All-weather through-smoke backscatter verification",
    statusKey: "database",
    freshness: "Standby",
  },
];

const EVACUATION_PROFILES = {
  Kangra: {
    settlements: [
      { name: "Birni Khas Forest Hamlet", dist: "1.1 km", pop: 320, zone: "1 km Immediate", status: "Evacuating" },
      { name: "Dharamshala Upper Beat", dist: "2.4 km", pop: 780, zone: "3 km High Alert", status: "Alerted" },
      { name: "Palampur Tea Estate Edge", dist: "4.6 km", pop: 1450, zone: "5 km Watch", status: "Standby" },
    ],
  },
  DEFAULT: {
    settlements: [
      { name: "Upper Pine Beat Village", dist: "1.3 km", pop: 240, zone: "1 km Immediate", status: "Alerted" },
      { name: "Ridge Forest Rest House", dist: "2.8 km", pop: 85, zone: "3 km High Alert", status: "Standby" },
      { name: "Valley Panchayat Cluster", dist: "4.5 km", pop: 910, zone: "5 km Watch", status: "Monitoring" },
    ],
  },
};

const INITIAL_TEAMS = [
  { id: "UNIT-01", unit: "DFO Rapid Forest Beat Squad", role: "Containment & Fireline", status: "Standby" },
  { id: "UNIT-02", unit: "HP Fire Services Tender #4", role: "Perimeter Suppression", status: "Standby" },
  { id: "UNIT-03", unit: "SDRF Mountain Rescue Team", role: "Village Evacuation", status: "Standby" },
  { id: "UNIT-04", unit: "108 Ambulance & Medical Unit", role: "Emergency Triage", status: "Standby" },
];

const WEATHER_DATA = [
  { district: "Una", temp: 26.4, humidity: 38, windKmh: 12, windDir: "NW → SE", dryDays: 6, fuel: "Dry Chir Pine Needles", fwi: 42, rating: "Moderate" },
  { district: "Sirmaur", temp: 24.8, humidity: 41, windKmh: 11, windDir: "NW → SE", dryDays: 5, fuel: "Chir Pine & Dry Scrub", fwi: 38, rating: "Moderate" },
  { district: "Kangra", temp: 22.5, humidity: 45, windKmh: 10, windDir: "W → E", dryDays: 4, fuel: "Pine Forest Edge", fwi: 34, rating: "Low" },
  { district: "Shimla", temp: 16.2, humidity: 52, windKmh: 14, windDir: "W → E", dryDays: 4, fuel: "Mixed Conifer & Oak", fwi: 26, rating: "Low" },
  { district: "Solan", temp: 21.6, humidity: 44, windKmh: 11, windDir: "NW → SE", dryDays: 5, fuel: "Dry Pine & Grass", fwi: 32, rating: "Low" },
  { district: "Mandi", temp: 20.8, humidity: 48, windKmh: 9, windDir: "S → N", dryDays: 4, fuel: "Chir Pine Slopes", fwi: 29, rating: "Low" },
  { district: "Bilaspur", temp: 24.1, humidity: 42, windKmh: 10, windDir: "NW → SE", dryDays: 5, fuel: "Lower Shivalik Pine", fwi: 35, rating: "Low" },
  { district: "Kullu", temp: 17.4, humidity: 54, windKmh: 12, windDir: "S → N", dryDays: 3, fuel: "Deodar & Pine", fwi: 22, rating: "Low" },
  { district: "Hamirpur", temp: 23.9, humidity: 43, windKmh: 10, windDir: "W → E", dryDays: 5, fuel: "Dry Scrub & Pine", fwi: 33, rating: "Low" },
  { district: "Chamba", temp: 16.8, humidity: 56, windKmh: 11, windDir: "W → E", dryDays: 3, fuel: "Sub-Alpine Forest", fwi: 21, rating: "Low" },
  { district: "Kinnaur", temp: 9.5, humidity: 61, windKmh: 16, windDir: "W → E", dryDays: 3, fuel: "Sparse Alpine", fwi: 14, rating: "Low" },
  { district: "Lahaul & Spiti", temp: 3.1, humidity: 68, windKmh: 15, windDir: "W → E", dryDays: 2, fuel: "Cold Desert / Sparse", fwi: 8, rating: "Low" },
];

const MODULES = [
  { id: "overview", n: "Overview Dashboard", phase: 1, restricted: false },
  { id: "satellite", n: "Live Satellite Monitoring", phase: 2, restricted: false },
  { id: "detection", n: "AI Detection & Segmentation", phase: 2, restricted: true },
  { id: "alerts", n: "Fire Alerts", phase: 3, restricted: false },
  { id: "evacuation", n: "Evacuation & Emergency", phase: 4, restricted: true },
  { id: "weather", n: "Weather & Risk Analysis", phase: 4, restricted: false },
];

const SEV_COLOR = {
  Low: "#b88a00",
  Medium: "#d9801a",
  High: "#d4501f",
  Critical: "#b3261e",
};

const SEV_ORDER = ["Critical", "High", "Medium", "Low"];

function MapFlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 10, { duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function App() {
  // Role & Auth State ("public" | "officer")
  const [officer, setOfficer] = useState(() => {
    const saved = localStorage.getItem("hfw_officer");
    return saved ? JSON.parse(saved) : null;
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const isOfficer = Boolean(officer);

  // Core App State
  const [route, setRoute] = useState("overview");
  const [sysStatus, setSysStatus] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

  // Filters & Map layers
  const [fDistrict, setFDistrict] = useState("All");
  const [fSev, setFSev] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [showDistRisk, setShowDistRisk] = useState(false);
  const [mapLayer, setMapLayer] = useState("topo");
  const [satMapLayer, setSatMapLayer] = useState("satellite");
  const [showHotspots, setShowHotspots] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [teams, setTeams] = useState(INITIAL_TEAMS);
  const [weatherDistrict, setWeatherDistrict] = useState("Bilaspur");

  // Segmentation state
  const [samplePatches, setSamplePatches] = useState([]);
  const [selectedPatch, setSelectedPatch] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [threshold, setThreshold] = useState(0.5);
  const [segLoading, setSegLoading] = useState(false);
  const [segError, setSegError] = useState("");
  const [segResult, setSegResult] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officer_id: loginId, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed.");
      setOfficer(data);
      localStorage.setItem("hfw_officer", JSON.stringify(data));
      setShowLoginModal(false);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setOfficer(null);
    localStorage.removeItem("hfw_officer");
    if (["detection", "evacuation"].includes(route)) {
      setRoute("overview");
    }
  };

  const handleNavigate = (mod) => {
    if (mod.restricted && !isOfficer) {
      setShowLoginModal(true);
      return;
    }
    setRoute(mod.id);
  };

  const loadBackendData = async () => {
    try {
      const [stRes, incRes, patchRes] = await Promise.all([
        fetch(`${API_BASE}/api/sources/status`),
        fetch(`${API_BASE}/api/incidents`),
        fetch(`${API_BASE}/api/sample-patches`),
      ]);
      if (stRes.ok) setSysStatus(await stRes.json());
      if (patchRes.ok) {
        const pJson = await patchRes.json();
        setSamplePatches(pJson.patches || []);
        if (pJson.patches?.length && !selectedPatch) {
          setSelectedPatch(pJson.patches[0]);
        }
      }
      if (incRes.ok) {
        const iJson = await incRes.json();
        const mapped = (iJson.incidents || []).map((r) => ({
          id: r.external_id,
          district: r.district,
          lat: r.lat,
          lon: r.lon,
          status: r.status === "Active" ? "New" : r.status,
          sev: r.severity === "Moderate" ? "Medium" : r.severity,
          ha: r.area_ha || 0,
          conf: r.confidence === "high" ? 0.92 : 0.8,
          frp: r.frp || 25.0,
          src: r.source,
          time: r.detected_time,
        }));
        setIncidents(mapped);
        setSelectedId(mapped.length > 0 ? mapped[0].id : null);
      }
    } catch (err) {
      console.error("Backend connection error:", err);
    }
  };

  useEffect(() => {
    loadBackendData();
  }, []);

  const handleSyncFirms = async () => {
    setSyncing(true);
    try {
      await fetch(`${API_BASE}/api/sync/firms?days=2`, { method: "POST" });
      await loadBackendData();
    } finally {
      setSyncing(false);
    }
  };

  const runSegmentation = async (mode = "sample") => {
    setSegLoading(true);
    setSegError("");
    try {
      let res;
      if (mode === "upload" && uploadedFile) {
        const fd = new FormData();
        fd.append("file", uploadedFile);
        res = await fetch(`${API_BASE}/api/segment?threshold=${threshold}`, {
          method: "POST",
          body: fd,
        });
      } else if (selectedPatch) {
        res = await fetch(
          `${API_BASE}/api/segment-sample/${encodeURIComponent(selectedPatch)}?threshold=${threshold}`,
          { method: "POST" }
        );
      } else {
        throw new Error("Select a sample Sentinel-2 scene or upload a .tif patch.");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Segmentation failed.");
      setSegResult(data);
    } catch (err) {
      setSegError(err.message);
    } finally {
      setSegLoading(false);
    }
  };

  const updateIncidentStatus = (id, newStatus) => {
    if (!isOfficer) {
      setShowLoginModal(true);
      return;
    }
    setIncidents((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  const handleSelectIncident = (inc) => {
    setSelectedId(inc.id);
    setFlyTarget([inc.lat, inc.lon]);
  };

  const filtered = incidents.filter(
    (i) =>
      (fDistrict === "All" || i.district === fDistrict) &&
      (fSev === "All" || i.sev === fSev) &&
      (fStatus === "All" || i.status === fStatus)
  );

  const selectedIncident = incidents.find((i) => i.id === selectedId) || filtered[0] || null;
  const activeCount = filtered.filter((i) => i.status !== "Resolved").length;
  const urgentCount = filtered.filter(
    (i) => i.status !== "Resolved" && (i.sev === "Critical" || i.sev === "High")
  ).length;
  const totalHa = filtered.reduce((acc, i) => acc + i.ha, 0);
  const currentModule = MODULES.find((m) => m.id === route) || MODULES[0];

  const TILE_URLS = {
    topo: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attr: "&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap",
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attr: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
    },
    street: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attr: "&copy; OpenStreetMap contributors",
    },
  };

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">
            <Flame size={18} />
          </div>
          <div>
            <b>Himachal Fire Watch</b>
            <span>{isOfficer ? "Command Center Mode" : "Public Advisory Portal"}</span>
          </div>
        </div>

        {/* Active Role Badge */}
        <div
          style={{
            margin: "0 8px",
            padding: "8px 10px",
            borderRadius: "6px",
            background: "var(--surface2)",
            border: "1px solid var(--line)",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
            {isOfficer ? (
              <>
                <UserCheck size={14} style={{ color: "var(--ok)" }} />
                <span>{officer.name}</span>
              </>
            ) : (
              <>
                <Eye size={14} style={{ color: "var(--muted)" }} />
                <span>Public Viewer Mode</span>
              </>
            )}
          </div>
          <div className="note" style={{ marginTop: "2px" }}>
            {isOfficer ? officer.role : "Read-only alerts & risk map"}
          </div>
        </div>

        <nav className="nav">
          {MODULES.map((m, idx) => {
            const locked = m.restricted && !isOfficer;
            return (
              <button
                key={m.id}
                aria-current={route === m.id ? "page" : undefined}
                onClick={() => handleNavigate(m)}
                style={{ opacity: locked ? 0.72 : 1 }}
              >
                <span className="n">{String(idx + 1).padStart(2, "0")}</span>
                <span>{m.n}</span>
                {locked ? (
                  <Lock size={12} style={{ color: "var(--muted)" }} />
                ) : (
                  <span className="tag">P{m.phase}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="side-foot">
          <div>
            DeepLabV3 Model:{" "}
            <b className="mono" style={{ color: sysStatus?.detection_model === "loaded" ? "var(--ok)" : "var(--warn)" }}>
              {sysStatus?.detection_model || "checking"}
            </b>
          </div>
          {isOfficer ? (
            <button className="btn ghost small" onClick={handleLogout} style={{ width: "100%", justifyContent: "center" }}>
              <LogOut size={13} />
              Switch to Public View
            </button>
          ) : (
            <button className="btn small" onClick={() => setShowLoginModal(true)} style={{ width: "100%", justifyContent: "center" }}>
              <Lock size={13} />
              Forest Officer Login
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main">
        <header className="top">
          <h2>{currentModule.n}</h2>
          <div className="fresh">
            <span className={`dot ${sysStatus?.database === "connected" ? "" : "warn"}`} />
            <span className="mono">
              DB: {sysStatus?.database || "offline"} · FIRMS: {sysStatus?.nasa_firms || "checking"}
            </span>
          </div>
          {isOfficer ? (
            <button className="btn small" onClick={handleSyncFirms} disabled={syncing}>
              <RefreshCw size={14} />
              {syncing ? "Syncing..." : "Sync Live FIRMS"}
            </button>
          ) : (
            <button className="btn ghost small" onClick={() => setShowLoginModal(true)}>
              <Lock size={13} />
              Officer Login
            </button>
          )}
        </header>

        {/* LOGIN MODAL */}
        {showLoginModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "grid",
              placeItems: "center",
              zIndex: 9999,
              padding: "16px",
            }}
          >
            <form
              onSubmit={handleLogin}
              className="panel"
              style={{ width: "100%", maxWidth: "400px", padding: "20px", display: "grid", gap: "14px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>HP Forest Officer Login</h3>
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  style={{ background: "none", border: 0, cursor: "pointer", fontSize: "18px" }}
                >
                  ×
                </button>
              </div>
              <p className="note" style={{ margin: 0 }}>
                Sign in with official Forest Department credentials to unlock AI Burn-Scar Segmentation, Evacuation Buffer Dispatch, and Alert Controls.
              </p>

              <label style={{ display: "grid", gap: "4px" }}>
                <span className="label">Official Email / Officer ID</span>
                <input
                  type="email"
                  required
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "6px", padding: "8px 10px" }}
                />
              </label>

              <label style={{ display: "grid", gap: "4px" }}>
                <span className="label">Password</span>
                <input
                  type="password"
                  required
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "6px", padding: "8px 10px" }}
                />
              </label>

              {loginError && (
                <div style={{ color: "var(--bad)", fontSize: "12.5px" }}>{loginError}</div>
              )}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button type="button" className="btn ghost small" onClick={() => setShowLoginModal(false)}>
                  Continue as Public Viewer
                </button>
                <button type="submit" className="btn small" disabled={loginLoading}>
                  {loginLoading ? "Verifying..." : "Sign In"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ROUTE 1: OVERVIEW DASHBOARD */}
        {route === "overview" && (
          <div className="content">
            {!isOfficer && (
              <div className="banner">
                <b>Public Advisory View:</b> You are viewing live Himachal Pradesh forest fire telemetry in read-only mode. <button onClick={() => setShowLoginModal(true)} style={{ background: "none", border: 0, color: "var(--accent)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", padding: 0 }}>Sign in as Forest Officer</button> to access AI burn-scar segmentation and evacuation dispatch.
              </div>
            )}

            {incidents.length === 0 && (
              <div className="banner">
                <b>All Clear (Real-Time Satellite Status):</b> Live NASA FIRMS VIIRS/MODIS telemetry returned <b>0 active forest fire hotspots</b> across Himachal Pradesh.
              </div>
            )}

            <div className="filters">
              <label>
                <span className="label">District</span>
                <select value={fDistrict} onChange={(e) => setFDistrict(e.target.value)}>
                  <option value="All">All Districts</option>
                  {DISTRICTS.map((d) => (
                    <option key={d.n} value={d.n}>{d.n}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Severity</span>
                <select value={fSev} onChange={(e) => setFSev(e.target.value)}>
                  <option value="All">All Severities</option>
                  {SEV_ORDER.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Status</span>
                <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="All">All Statuses</option>
                  <option value="New">New</option>
                  <option value="Acknowledged">Acknowledged</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </label>
              <button
                className="btn ghost small"
                onClick={() => {
                  setFDistrict("All");
                  setFSev("All");
                  setFStatus("All");
                  setFlyTarget(null);
                }}
              >
                Clear filters
              </button>
            </div>

            <div className="kpis">
              <div className="kpi">
                <span className="label">Live fires detected</span>
                <div className="v">{filtered.length}</div>
                <span className="s">NASA FIRMS VIIRS feed</span>
              </div>
              <div className="kpi">
                <span className="label">Active hotspots</span>
                <div className="v">
                  {activeCount}
                  <small>{urgentCount} high/critical</small>
                </div>
                <span className="s">Real-time thermal anomalies</span>
              </div>
              <div className="kpi">
                <span className="label">Active burnt area</span>
                <div className="v">
                  {totalHa.toFixed(1)}
                  <small>ha</small>
                </div>
                <span className="s">Live incident total</span>
              </div>
              <div className="kpi">
                <span className="label">Access Level</span>
                <div className="v" style={{ fontSize: "19px", display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className={`dot ${isOfficer ? "" : "warn"}`} />
                  {isOfficer ? "Authorized Officer" : "Public Read-Only"}
                </div>
                <span className="s">{isOfficer ? officer.role : "Login for command actions"}</span>
              </div>
            </div>

            <div className="grid2">
              <div style={{ display: "grid", gap: "16px" }}>
                <section className="panel">
                  <div className="panel-h">
                    <h3>Himachal Pradesh Live Incident Map</h3>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <select
                        value={mapLayer}
                        onChange={(e) => setMapLayer(e.target.value)}
                        style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "5px", padding: "3px 8px", fontSize: "12px" }}
                      >
                        <option value="topo">Terrain / Topo</option>
                        <option value="satellite">Satellite Imagery</option>
                        <option value="street">Street Map</option>
                      </select>
                      <span className="note">{filtered.length} active</span>
                    </div>
                  </div>

                  <div style={{ height: "440px", width: "100%", zIndex: 1 }}>
                    <MapContainer center={[31.75, 77.15]} zoom={8} style={{ height: "100%", width: "100%" }}>
                      <TileLayer key={mapLayer} attribution={TILE_URLS[mapLayer].attr} url={TILE_URLS[mapLayer].url} />
                      <MapFlyTo center={flyTarget} />

                      {showDistRisk &&
                        DISTRICTS.map((d) => {
                          const col = d.risk > 0.75 ? "#d4501f" : d.risk > 0.6 ? "#d9801a" : "#2f7d4f";
                          return (
                            <CircleMarker
                              key={`risk-${d.n}`}
                              center={[d.lat, d.lon]}
                              radius={18 + d.risk * 12}
                              pathOptions={{ color: "transparent", fillColor: col, fillOpacity: 0.16 }}
                            />
                          );
                        })}

                      {filtered.map((inc) => {
                        const isSel = selectedIncident?.id === inc.id;
                        const radius = 7 + Math.min(9, Math.sqrt(inc.ha) * 0.75);
                        return (
                          <CircleMarker
                            key={inc.id}
                            center={[inc.lat, inc.lon]}
                            radius={radius}
                            eventHandlers={{ click: () => setSelectedId(inc.id) }}
                            pathOptions={{
                              color: isSel ? "#111827" : "#ffffff",
                              weight: isSel ? 3 : 1.5,
                              fillColor: inc.status === "Resolved" ? "#64748b" : SEV_COLOR[inc.sev],
                              fillOpacity: inc.status === "Resolved" ? 0.45 : 0.88,
                            }}
                          >
                            <Popup>
                              <div style={{ color: "#17211c", fontSize: "12.5px", lineHeight: "1.45" }}>
                                <strong>{inc.id} · {inc.district}</strong> ({inc.sev})<br />
                                Coords: {inc.lat.toFixed(3)}°N, {inc.lon.toFixed(3)}°E<br />
                                Burnt Area: <strong>{inc.ha.toFixed(1)} ha</strong>
                              </div>
                            </Popup>
                          </CircleMarker>
                        );
                      })}
                    </MapContainer>
                  </div>

                  <div className="legend">
                    <span>Real-time NASA FIRMS thermal detections plotted automatically</span>
                    <label style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={showDistRisk} onChange={(e) => setShowDistRisk(e.target.checked)} />
                      District seasonal risk zones
                    </label>
                  </div>
                </section>
              </div>

              <div style={{ display: "grid", gap: "16px" }}>
                <section className="panel">
                  <div className="panel-h">
                    <h3>{selectedIncident ? `${selectedIncident.id} · ${selectedIncident.district}` : "Incident detail"}</h3>
                    {selectedIncident && (
                      <span className="pill" style={{ color: SEV_COLOR[selectedIncident.sev] }}>{selectedIncident.sev}</span>
                    )}
                  </div>
                  {selectedIncident ? (
                    <div className="panel-b detail">
                      <div className="dgrid">
                        <div>
                          <div className="label">Location</div>
                          <div className="val mono">{selectedIncident.lat.toFixed(3)}° N, {selectedIncident.lon.toFixed(3)}° E</div>
                        </div>
                        <div>
                          <div className="label">Affected Area</div>
                          <div className="val mono">{selectedIncident.ha.toFixed(1)} ha</div>
                        </div>
                      </div>

                      {isOfficer ? (
                        <div className="actions">
                          <button
                            className="btn small"
                            onClick={() => {
                              setRoute("detection");
                              if (selectedPatch) runSegmentation("sample");
                            }}
                          >
                            <ScanSearch size={14} />
                            Analyze Burn Scar (AI)
                          </button>
                          {selectedIncident.status === "New" && (
                            <button className="btn ghost small" onClick={() => updateIncidentStatus(selectedIncident.id, "Acknowledged")}>
                              Acknowledge
                            </button>
                          )}
                          {selectedIncident.status !== "Resolved" && (
                            <button className="btn ghost small" onClick={() => updateIncidentStatus(selectedIncident.id, "Resolved")}>
                              Mark resolved
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="note">Officer login required to acknowledge alerts or run AI segmentation.</div>
                      )}
                    </div>
                  ) : (
                    <div className="empty">No active fire hotspots right now.</div>
                  )}
                </section>

                <section className="panel">
                  <div className="panel-h">
                    <h3>Live Incidents Feed</h3>
                    <span className="note">{filtered.length} active</span>
                  </div>
                  <div className="ilist">
                    {filtered.length > 0 ? (
                      filtered.map((inc) => (
                        <button
                          key={inc.id}
                          className="irow"
                          aria-pressed={selectedIncident?.id === inc.id}
                          onClick={() => handleSelectIncident(inc)}
                        >
                          <span className="stripe" style={{ background: inc.status === "Resolved" ? "var(--line)" : SEV_COLOR[inc.sev] }} />
                          <span>
                            <span className="t"><span className="mono">{inc.id}</span> {inc.district}</span>
                            <span className="m">{inc.ha.toFixed(1)} ha · {inc.src} · {inc.time}</span>
                          </span>
                          <span className="pill" style={{ color: SEV_COLOR[inc.sev] }}>{inc.sev}</span>
                        </button>
                      ))
                    ) : (
                      <div className="empty">0 active thermal anomalies reported by NASA FIRMS.</div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* ROUTE 2: LIVE SATELLITE MONITORING */}
        {route === "satellite" && (
          <div className="content">
            <section className="panel">
              <div className="panel-h">
                <h3>
                  <Satellite size={16} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
                  Satellite Constellation &amp; Telemetry Freshness
                </h3>
                {isOfficer && (
                  <button className="btn small" onClick={handleSyncFirms} disabled={syncing}>
                    <RefreshCw size={13} />
                    {syncing ? "Syncing..." : "Poll NASA FIRMS"}
                  </button>
                )}
              </div>
              <div className="scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Satellite / Sensor</th>
                      <th>Spectral Bands</th>
                      <th>Revisit Cadence</th>
                      <th>Operational Role</th>
                      <th>Pipeline Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SATELLITE_FEEDS.map((feed) => {
                      const rawState = sysStatus?.[feed.statusKey] || feed.freshness;
                      const isOk = ["authenticated", "loaded", "connected", "Fresh", "Ready"].includes(rawState);
                      return (
                        <tr key={feed.name}>
                          <td><b>{feed.name}</b></td>
                          <td className="mono">{feed.band}</td>
                          <td>{feed.cadence}</td>
                          <td className="note">{feed.purpose}</td>
                          <td>
                            <span className={`dot ${isOk ? "" : "warn"}`} style={{ display: "inline-block", marginRight: "6px" }} />
                            <span className="mono">{rawState}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-h">
                <h3>
                  <Radio size={16} style={{ verticalAlign: "-3px", marginRight: "6px", color: "var(--sev-high)" }} />
                  Himachal Pradesh Multi-Layer Satellite &amp; Thermal View
                </h3>
                <select
                  value={satMapLayer}
                  onChange={(e) => setSatMapLayer(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "5px", padding: "4px 8px", fontSize: "12px" }}
                >
                  <option value="satellite">High-Res Satellite (Esri)</option>
                  <option value="topo">Himalayan Terrain / Topo</option>
                  <option value="street">Administrative Base</option>
                </select>
              </div>
              <div style={{ height: "460px", width: "100%", zIndex: 1 }}>
                <MapContainer center={[31.75, 77.15]} zoom={8} style={{ height: "100%", width: "100%" }}>
                  <TileLayer key={satMapLayer} attribution={TILE_URLS[satMapLayer].attr} url={TILE_URLS[satMapLayer].url} />
                  {showHotspots &&
                    incidents.map((inc) => (
                      <CircleMarker
                        key={`sat-${inc.id}`}
                        center={[inc.lat, inc.lon]}
                        radius={10}
                        pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: SEV_COLOR[inc.sev], fillOpacity: 0.9 }}
                      />
                    ))}
                </MapContainer>
              </div>
            </section>
          </div>
        )}

        {/* ROUTE 3: AI DETECTION & SEGMENTATION (OFFICER ONLY) */}
        {route === "detection" && isOfficer && (
          <div className="content">
            <section className="panel">
              <div className="panel-h">
                <h3>Sentinel-2 Burn-Scar Delineation (DeepLabV3-ResNet50)</h3>
                <span className="pill" style={{ color: "var(--ok)" }}>
                  <CheckCircle2 size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                  6-Band Z-Score Pipeline Active
                </span>
              </div>
              <div className="panel-b" style={{ display: "grid", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px", alignItems: "end" }}>
                  {/* Upload Sentinel-2 GeoTIFF */}
                  <div>
                    <div className="label" style={{ marginBottom: "6px" }}>Upload Sentinel-2 GeoTIFF (.tif)</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <label
                        style={{
                          flex: 1,
                          background: "var(--bg)",
                          border: "1px dashed var(--line)",
                          borderRadius: "6px",
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: "13px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Upload size={13} style={{ marginRight: "6px", verticalAlign: "-2px" }} />
                        {uploadedFile ? uploadedFile.name : "Choose .tif file..."}
                        <input
                          type="file"
                          accept=".tif,.tiff"
                          style={{ display: "none" }}
                          onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      <button
                        className="btn small"
                        disabled={segLoading || !uploadedFile}
                        onClick={() => runSegmentation("upload")}
                      >
                        {segLoading ? "Scanning..." : "Analyze Burn Scar"}
                      </button>
                    </div>
                  </div>

                  {/* Threshold Slider */}
                  <div>
                    <div className="label" style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span>Segmentation Threshold (τ)</span>
                      <span className="mono">{threshold.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={threshold}
                      onChange={(e) => setThreshold(parseFloat(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                </div>

                {segError && (
                  <div style={{ color: "var(--bad)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <AlertCircle size={15} /> {segError}
                  </div>
                )}
              </div>
            </section>

            {segResult && (
              <>
                <div className="kpis">
                  <div className="kpi">
                    <span className="label">Burnt Coverage</span>
                    <div className="v" style={{ color: "var(--sev-crit)" }}>{segResult.burnt_percentage}%</div>
                    <span className="s">{segResult.filename}</span>
                  </div>
                  <div className="kpi">
                    <span className="label">Delineated Burn Area</span>
                    <div className="v">{segResult.burnt_area_ha}<small>ha</small></div>
                    <span className="s">Computed from native pixel scale</span>
                  </div>
                  <div className="kpi">
                    <span className="label">Post-Fire Mean NBR</span>
                    <div className="v">{segResult.mean_nbr}</div>
                    <span className="s">(B8 − B12) / (B8 + B12)</span>
                  </div>
                  <div className="kpi">
                    <span className="label">Spatial Reference</span>
                    <div className="v" style={{ fontSize: "18px", marginTop: "6px" }}>{segResult.crs || "UTM"}</div>
                    <span className="s">{segResult.dimensions} px</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "16px" }}>
                  {[
                    { title: "True-Color RGB (B4/B3/B2)", src: segResult.images.true_color, sub: "Natural optical composite" },
                    { title: "False-Color SWIR (B12/B8/B4)", src: segResult.images.false_color, sub: "SWIR reflectance highlights charred scar" },
                    { title: "DeepLabV3 Burn Mask", src: segResult.images.burn_mask, sub: `Binary mask at τ = ${threshold.toFixed(2)}` },
                    { title: "Delineated Scar Overlay", src: segResult.images.overlay, sub: "Segmented burn perimeter (red)" },
                  ].map((card) => (
                    <section className="panel" key={card.title}>
                      <div className="panel-h"><h3>{card.title}</h3></div>
                      <div className="panel-b" style={{ display: "grid", gap: "8px" }}>
                        <img src={card.src} alt={card.title} style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", borderRadius: "6px", background: "#0f172a" }} />
                        <span className="note">{card.sub}</span>
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ROUTE 4: ALERTS TABLE */}
        {route === "alerts" && (
          <div className="content">
            <section className="panel">
              <div className="panel-h">
                <h3>Real-Time Fire Alerts</h3>
                <span className="note">{isOfficer ? "Command controls active" : "Read-only public feed"}</span>
              </div>
              <div className="scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>District</th>
                      <th>Severity</th>
                      <th>Area</th>
                      <th>Confidence</th>
                      <th>Source</th>
                      <th>Status</th>
                      {isOfficer && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length > 0 ? (
                      filtered.map((i) => (
                        <tr key={i.id}>
                          <td className="mono">{i.id}</td>
                          <td>{i.district}</td>
                          <td><span className="pill" style={{ color: SEV_COLOR[i.sev] }}>{i.sev}</span></td>
                          <td className="mono">{i.ha.toFixed(1)} ha</td>
                          <td className="mono">{Math.round(i.conf * 100)}%</td>
                          <td>{i.src}</td>
                          <td>{i.status}</td>
                          {isOfficer && (
                            <td>
                              {i.status === "New" && (
                                <button className="btn small" onClick={() => updateIncidentStatus(i.id, "Acknowledged")}>
                                  Acknowledge
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={isOfficer ? "8" : "7"} className="empty">
                          No active fire alerts across Himachal Pradesh.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ROUTE 5: EVACUATION & EMERGENCY RESPONSE (OFFICER ONLY) */}
        {route === "evacuation" && isOfficer && (
          <div className="content">
            <div className="banner">
              <b>Authorized Command View:</b> Evacuation buffer rings (1 km / 3 km / 5 km) and response team deployment are restricted to Forest Department &amp; SDRF officers.
            </div>
            <section className="panel">
              <div className="panel-h">
                <h3>Emergency Response Units</h3>
                <span className="note">live readiness</span>
              </div>
              <div className="ilist">
                {teams.map((t) => (
                  <div key={t.id} className="irow" style={{ cursor: "default" }}>
                    <span className="stripe" style={{ background: t.status === "On-Site" ? "var(--ok)" : t.status === "Dispatched" ? "var(--warn)" : "var(--line)" }} />
                    <span>
                      <span className="t"><span className="mono">{t.id}</span> {t.unit}</span>
                      <span className="m">{t.role}</span>
                    </span>
                    <select
                      value={t.status}
                      onChange={(e) =>
                        setTeams((prev) => prev.map((item) => (item.id === t.id ? { ...item, status: e.target.value } : item)))
                      }
                      style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "5px", padding: "4px 8px", fontSize: "12px" }}
                    >
                      <option value="Standby">Standby</option>
                      <option value="Dispatched">Dispatched</option>
                      <option value="On-Site">On-Site</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ROUTE 6: WEATHER & RISK ANALYSIS */}
        {route === "weather" && (() => {
          const activeWx = WEATHER_DATA.find((w) => w.district === weatherDistrict) || WEATHER_DATA[0];
          const ratingColor =
            activeWx.rating === "Extreme"
              ? "var(--sev-crit)"
              : activeWx.rating === "High"
              ? "var(--sev-high)"
              : activeWx.rating === "Moderate"
              ? "var(--sev-med)"
              : "var(--ok)";

          return (
            <div className="content">
              <div className="filters">
                <label>
                  <span className="label">Select District for Weather &amp; Spread Telemetry</span>
                  <select value={weatherDistrict} onChange={(e) => setWeatherDistrict(e.target.value)} style={{ minWidth: "220px" }}>
                    {WEATHER_DATA.map((w) => (
                      <option key={w.district} value={w.district}>
                        {w.district} ({w.rating} Risk · FWI {w.fwi})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="kpis">
                <div className="kpi">
                  <span className="label"><Thermometer size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />Surface Temp / RH</span>
                  <div className="v">{activeWx.temp}°C <small>/ {activeWx.humidity}% RH</small></div>
                  <span className="s">{activeWx.humidity < 25 ? "Critical low humidity" : "Normal seasonal moisture"}</span>
                </div>
                <div className="kpi">
                  <span className="label"><Wind size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />Wind Vector</span>
                  <div className="v">{activeWx.windKmh} <small>km/h ({activeWx.windDir})</small></div>
                  <span className="s">Primary terrain wind axis</span>
                </div>
                <div className="kpi">
                  <span className="label"><Droplets size={12} style={{ verticalAlign: "-2px", marginRight: "4px" }} />Dry Spell &amp; Fuel</span>
                  <div className="v">{activeWx.dryDays} <small>days dry</small></div>
                  <span className="s">{activeWx.fuel}</span>
                </div>
                <div className="kpi">
                  <span className="label">Fire Weather Index (FWI)</span>
                  <div className="v" style={{ color: ratingColor }}>{activeWx.fwi} <small>/ 100 ({activeWx.rating})</small></div>
                  <span className="s">Composite ignition danger rating</span>
                </div>
              </div>

              <section className="panel">
                <div className="panel-h">
                  <h3>Himachal Pradesh District-Wise Fire Weather &amp; Fuel Risk Matrix</h3>
                  <span className="note">click any district row to inspect</span>
                </div>
                <div className="scroll">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>District</th>
                        <th>Temp (°C)</th>
                        <th>Humidity</th>
                        <th>Wind &amp; Direction</th>
                        <th>Dry Days</th>
                        <th>Dominant Fuel</th>
                        <th>FWI Score</th>
                        <th>Risk Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WEATHER_DATA.map((w) => {
                        const col =
                          w.rating === "Extreme"
                            ? "var(--sev-crit)"
                            : w.rating === "High"
                            ? "var(--sev-high)"
                            : w.rating === "Moderate"
                            ? "var(--sev-med)"
                            : "var(--ok)";
                        return (
                          <tr
                            key={w.district}
                            onClick={() => setWeatherDistrict(w.district)}
                            style={{ cursor: "pointer", background: w.district === weatherDistrict ? "var(--surface2)" : "transparent" }}
                          >
                            <td><b>{w.district}</b></td>
                            <td className="mono">{w.temp.toFixed(1)}°C</td>
                            <td className="mono">{w.humidity}%</td>
                            <td className="mono">{w.windKmh} km/h ({w.windDir})</td>
                            <td className="mono">{w.dryDays} d</td>
                            <td className="note">{w.fuel}</td>
                            <td className="mono"><b>{w.fwi}</b></td>
                            <td><span className="pill" style={{ color: col }}>{w.rating}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          );
        })()}
      </main>
    </div>
  );
}