import React, { useState } from "react";
import { Upload, Flame, Layers, Sliders, AlertCircle, CheckCircle2, Image as ImageIcon } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

export default function BurnScarPanel({ modelLoaded }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [threshold, setThreshold] = useState(0.5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setError("");
  };

  const handleRunSegmentation = async () => {
    if (!selectedFile) {
      setError("Please select a 6-band Sentinel-2 GeoTIFF (.tif) patch first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${API_BASE}/api/segment?threshold=${threshold}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Segmentation request failed.");
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to connect to segmentation backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          background: "#1e293b",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #334155",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>
              DeepLabV3 Sentinel-2 Burn-Scar Segmentation
            </h2>
            <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
              Upload a 6-band Sentinel-2 GeoTIFF patch (B2, B3, B4, B8, B11, B12) to delineate post-fire burn scars.
            </p>
          </div>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              padding: "6px 12px",
              borderRadius: "999px",
              background: modelLoaded ? "#052e16" : "#451a03",
              color: modelLoaded ? "#4ade80" : "#fde68a",
              border: `1px solid ${modelLoaded ? "#16a34a" : "#d97706"}`,
            }}
          >
            <CheckCircle2 size={14} />
            {modelLoaded ? "DeepLabV3-ResNet50 Ready" : "Checking Model Weights"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "16px", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px" }}>
              SENTINEL-2 GEOTIFF PATCH (.TIF)
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "#0f172a",
                border: "1px dashed #475569",
                padding: "10px 14px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                color: selectedFile ? "#f8fafc" : "#94a3b8",
              }}
            >
              <Upload size={16} color="#f97316" />
              <span>{selectedFile ? selectedFile.name : "Choose .tif / .tiff satellite patch..."}</span>
              <input
                type="file"
                accept=".tif,.tiff"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </label>
          </div>

          <div>
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "#94a3b8",
                marginBottom: "6px",
              }}
            >
              <span>PROBABILITY THRESHOLD</span>
              <span style={{ color: "#f97316", fontWeight: "700" }}>{threshold.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#ea580c", cursor: "pointer" }}
            />
          </div>

          <button
            onClick={handleRunSegmentation}
            disabled={loading || !selectedFile}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: loading || !selectedFile ? "#475569" : "#ea580c",
              color: "white",
              border: "none",
              padding: "11px 18px",
              borderRadius: "6px",
              cursor: loading || !selectedFile ? "not-allowed" : "pointer",
              fontWeight: "600",
              fontSize: "13px",
            }}
          >
            <Flame size={16} />
            {loading ? "Running Inference..." : "Detect Burn Scar"}
          </button>
        </div>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#450a0a",
              border: "1px solid #dc2626",
              color: "#fecaca",
              padding: "10px 14px",
              borderRadius: "6px",
              fontSize: "13px",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            <div style={{ background: "#1e293b", padding: "16px", borderRadius: "8px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "12px" }}>
                <span>BURNT COVERAGE</span>
                <Flame size={16} color="#ef4444" />
              </div>
              <div style={{ fontSize: "26px", fontWeight: "700", marginTop: "6px", color: "#f87171" }}>
                {result.burnt_percentage}%
              </div>
            </div>

            <div style={{ background: "#1e293b", padding: "16px", borderRadius: "8px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "12px" }}>
                <span>DELINEATED BURN AREA</span>
                <Layers size={16} color="#f97316" />
              </div>
              <div style={{ fontSize: "26px", fontWeight: "700", marginTop: "6px" }}>
                {result.burnt_area_ha} ha
              </div>
            </div>

            <div style={{ background: "#1e293b", padding: "16px", borderRadius: "8px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "12px" }}>
                <span>POST-FIRE NBR (MEAN)</span>
                <Sliders size={16} color="#38bdf8" />
              </div>
              <div style={{ fontSize: "26px", fontWeight: "700", marginTop: "6px" }}>
                {result.mean_nbr}
              </div>
            </div>

            <div style={{ background: "#1e293b", padding: "16px", borderRadius: "8px", border: "1px solid #334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "12px" }}>
                <span>SPATIAL METADATA</span>
                <ImageIcon size={16} color="#22c55e" />
              </div>
              <div style={{ fontSize: "14px", fontWeight: "600", marginTop: "10px", color: "#cbd5e1" }}>
                {result.dimensions} px | {result.crs || "Native GeoTIFF CRS"}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
            {[
              { title: "True-Color RGB (B4/B3/B2)", src: result.images.true_color, desc: "Natural optical composite" },
              { title: "False-Color SWIR (B12/B8/B4)", src: result.images.false_color, desc: "SWIR reflectance highlights charred vegetation" },
              { title: "Predicted Burn Mask", src: result.images.burn_mask, desc: `Binary mask at threshold = ${threshold.toFixed(2)}` },
              { title: "Burn Scar Overlay", src: result.images.overlay, desc: "Delineated burn scar extent (red)" },
            ].map((panel) => (
              <div
                key={panel.title}
                style={{
                  background: "#1e293b",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #334155",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#f8fafc" }}>{panel.title}</div>
                <img
                  src={panel.src}
                  alt={panel.title}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "contain",
                    background: "#0f172a",
                    borderRadius: "6px",
                    border: "1px solid #334155",
                  }}
                />
                <div style={{ fontSize: "11px", color: "#94a3b8" }}>{panel.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}