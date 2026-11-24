import base64
from pathlib import Path
import tempfile
import zipfile
import requests


MODELS_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODELS_DIR / "deeplabv3_burnt_best.pth"
ZIP_PATH = MODELS_DIR / "deeplabv3_burnt_best.pth.zip"
MODEL_URL = "https://github.com/Shanvi0708/himachal-fire-watch/releases/download/v1.0.0/deeplabv3_burnt_best.pth.zip"

def ensure_model_weights():
    if MODEL_PATH.exists():
        return
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with requests.get(MODEL_URL, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(ZIP_PATH, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        zf.extractall(MODELS_DIR)
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()

import cv2
import numpy as np
import rasterio
import torch
import torch.nn as nn
from torchvision.models.segmentation import deeplabv3_resnet50

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "deeplabv3_burnt_best.pth"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
PIXEL_AREA_M2 = 100  # 10m x 10m Sentinel-2 spatial resolution


class BurnScarSegmenter:
    def __init__(self, weights_path: Path = MODEL_PATH):
        self.weights_path = weights_path
        self.model = None
        self.loaded = False
        self._load_weights()

    def _load_weights(self) -> None:
        if not self.weights_path.exists():
            return

        ckpt = torch.load(self.weights_path, map_location=DEVICE, weights_only=False)
        state_dict = (
            ckpt["model_state_dict"]
            if isinstance(ckpt, dict) and "model_state_dict" in ckpt
            else ckpt
        )

        model = deeplabv3_resnet50(weights=None)
        old_conv = model.backbone.conv1
        model.backbone.conv1 = nn.Conv2d(
            6, old_conv.out_channels, kernel_size=7, stride=2, padding=3, bias=False
        )
        model.classifier[4] = nn.Conv2d(256, 1, kernel_size=1)
        if model.aux_classifier is not None:
            model.aux_classifier[4] = nn.Conv2d(256, 1, kernel_size=1)

        model.load_state_dict(state_dict, strict=False)
        model.to(DEVICE).eval()
        self.model = model
        self.loaded = True

    @staticmethod
    def _encode_png(img_rgb: np.ndarray) -> str:
        img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR) if img_rgb.ndim == 3 else img_rgb
        _, buffer = cv2.imencode(".png", img_bgr)
        return f"data:image/png;base64,{base64.b64encode(buffer).decode('utf-8')}"

    def predict_tif(self, file_bytes: bytes, filename: str, threshold: float = 0.5) -> dict:
        if not self.loaded or self.model is None:
            raise RuntimeError("DeepLabV3 model weights are not loaded.")

        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = Path(tmp.name)

        try:
            with rasterio.open(tmp_path) as src:
                raw = src.read().astype(np.float32)
                bounds = [float(b) for b in src.bounds] if src.bounds is not None else None
                crs = str(src.crs) if src.crs is not None else None
                # Calculate actual pixel area in m² if CRS is projected (e.g., UTM EPSG:32643)
                if src.crs is not None and src.crs.is_projected and src.transform is not None:
                    pixel_area_m2 = abs(float(src.transform.a) * float(src.transform.e))
                else:
                    pixel_area_m2 = float(PIXEL_AREA_M2)
        finally:
            tmp_path.unlink(missing_ok=True)

        if raw.shape[0] < 6:
            raise ValueError(f"Expected a 6-band Sentinel-2 GeoTIFF, but received {raw.shape[0]} band(s).")

        raw = np.nan_to_num(raw[:6], nan=0.0, posinf=0.0, neginf=0.0)
        orig_h, orig_w = int(raw.shape[1]), int(raw.shape[2])


        # 1. Per-band Z-score standardization for DeepLabV3 inference (matches training)
        band_mean = np.mean(raw, axis=(1, 2), keepdims=True).astype(np.float32)
        band_std = np.std(raw, axis=(1, 2), keepdims=True).astype(np.float32)
        model_norm = ((raw - band_mean) / np.maximum(band_std, 1e-6)).astype(np.float32)

        # Resize to 256x256 for inference
        hwc = np.ascontiguousarray(np.transpose(model_norm, (1, 2, 0)), dtype=np.float32)
        resized = cv2.resize(hwc, (256, 256), interpolation=cv2.INTER_LINEAR)
        chw = np.ascontiguousarray(np.transpose(resized, (2, 0, 1)), dtype=np.float32)
        tensor_in = torch.from_numpy(chw).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            logits = self.model(tensor_in)["out"]
            prob_map = torch.sigmoid(logits).squeeze().cpu().numpy().astype(np.float32)

        prob_map = cv2.resize(prob_map, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
        pred_mask = (prob_map >= float(threshold)).astype(np.uint8)

        # Burn area metrics and Normalized Burn Ratio (Band 4 = NIR, Band 6 = SWIR2)
        burnt_pixels = int(np.count_nonzero(pred_mask))
        total_pixels = int(pred_mask.size)
        burnt_pct = round((burnt_pixels / max(total_pixels, 1)) * 100.0, 2)
        burnt_area_ha = round((burnt_pixels * pixel_area_m2) / 10_000.0, 2)
        nbr = (raw[3] - raw[5]) / (raw[3] + raw[5] + 1e-6)
        mean_nbr = round(float(np.mean(nbr)), 3)

        # 2. 2nd-98th percentile stretch strictly for display PNG visualization
        p2 = np.percentile(raw, 2, axis=(1, 2), keepdims=True).astype(np.float32)
        p98 = np.percentile(raw, 98, axis=(1, 2), keepdims=True).astype(np.float32)
        vis_norm = np.clip((raw - p2) / np.maximum(p98 - p2, 1e-6), 0.0, 1.0).astype(np.float32)

        # True-Color RGB (Bands 3, 2, 1) and False-Color SWIR Composite (Bands 6, 4, 3)
        rgb_uint8 = np.ascontiguousarray(
            (np.stack([vis_norm[2], vis_norm[1], vis_norm[0]], axis=-1) * 255.0).clip(0, 255),
            dtype=np.uint8,
        )
        false_color_uint8 = np.ascontiguousarray(
            (np.stack([vis_norm[5], vis_norm[3], vis_norm[2]], axis=-1) * 255.0).clip(0, 255),
            dtype=np.uint8,
        )

        # Alpha-blend red highlight over burnt pixels without OpenCV sub-slice quirks
        overlay = rgb_uint8.copy()
        mask_bool = pred_mask > 0
        if np.any(mask_bool):
            overlay[mask_bool, 0] = (rgb_uint8[mask_bool, 0].astype(np.float32) * 0.55 + 255.0 * 0.45).astype(np.uint8)
            overlay[mask_bool, 1] = (rgb_uint8[mask_bool, 1].astype(np.float32) * 0.55).astype(np.uint8)
            overlay[mask_bool, 2] = (rgb_uint8[mask_bool, 2].astype(np.float32) * 0.55).astype(np.uint8)

        mask_vis = np.ascontiguousarray(pred_mask * 255, dtype=np.uint8)

        return {
            "filename": str(filename),
            "dimensions": f"{orig_w}x{orig_h}",
            "crs": crs,
            "bounds": bounds,
            "burnt_percentage": burnt_pct,
            "burnt_area_ha": burnt_area_ha,
            "mean_nbr": mean_nbr,
            "images": {
                "true_color": self._encode_png(rgb_uint8),
                "false_color": self._encode_png(false_color_uint8),
                "burn_mask": self._encode_png(mask_vis),
                "overlay": self._encode_png(overlay),
            },
        }


segmenter = BurnScarSegmenter()