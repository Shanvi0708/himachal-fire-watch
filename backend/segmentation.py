import base64
import gc
from pathlib import Path
import tempfile
import traceback
import zipfile

import cv2
import numpy as np
import rasterio
import requests
import torch
import torch.nn as nn
from torchvision.models.segmentation import deeplabv3_resnet50

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "deeplabv3_burnt_best.pth"
ZIP_PATH = MODELS_DIR / "deeplabv3_burnt_best.pth.zip"
MODEL_URL = "https://github.com/Shanvi0708/himachal-fire-watch/releases/download/v1.0.0/deeplabv3_burnt_best.pth.zip"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
PIXEL_AREA_M2 = 100  # 10m x 10m Sentinel-2 spatial resolution


def resolve_weights_path() -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    target_path = MODELS_DIR / "deeplabv3_burnt_best.pth"

    def is_valid_torch_file(path: Path) -> bool:
        if not path.is_file() or path.stat().st_size < 10_000_000:
            return False
        try:
            torch.load(path, map_location="cpu", weights_only=False)
            return True
        except Exception:
            return False

    if is_valid_torch_file(target_path):
        return target_path

    # Purani galat extracted files saaf karein
    for old in MODELS_DIR.iterdir():
        if old.is_file():
            old.unlink(missing_ok=True)

    print("Downloading DeepLabV3 weights from GitHub Release...")
    with requests.get(MODEL_URL, stream=True, timeout=180) as r:
        r.raise_for_status()
        with open(ZIP_PATH, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)

    # Case 1: Downloaded file khud hi valid .pth model hai
    if is_valid_torch_file(ZIP_PATH):
        ZIP_PATH.replace(target_path)
        return target_path

    # Case 2: Downloaded file ek real .zip folder hai jiske andar .pth file hai
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        zf.extractall(MODELS_DIR)
    ZIP_PATH.unlink(missing_ok=True)
    gc.collect()

    for p in MODELS_DIR.rglob("*"):
        if is_valid_torch_file(p):
            return p

    raise FileNotFoundError("Downloaded file does not contain a valid PyTorch checkpoint.")
class BurnScarSegmenter:
    def __init__(self, weights_path: Path = MODEL_PATH):
        self.weights_path = weights_path
        self.model = None
        self.loaded = False
        self.load_error = None
        self._load_weights()

    def _load_weights(self) -> None:
        try:
            if not self.weights_path.exists():
                self.weights_path = resolve_weights_path()

            print(f"Loading DeepLabV3 weights from: {self.weights_path}")
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
            del ckpt, state_dict
            gc.collect()


            model.to(DEVICE).eval()
            self.model = model
            self.loaded = True
            print("DeepLabV3 model loaded successfully!")
        except Exception as e:
            traceback.print_exc()
            self.load_error = f"{type(e).__name__}: {e}"
            self.model = None
            self.loaded = False

    @staticmethod
    def _encode_png(img_rgb: np.ndarray) -> str:
        img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR) if img_rgb.ndim == 3 else img_rgb
        _, buffer = cv2.imencode(".png", img_bgr)
        return f"data:image/png;base64,{base64.b64encode(buffer).decode('utf-8')}"

    def predict_tif(self, file_bytes: bytes, filename: str, threshold: float = 0.5) -> dict:
        if not self.loaded or self.model is None:
            self._load_weights()
        if not self.loaded or self.model is None:
            raise RuntimeError(f"DeepLabV3 model weights are not loaded ({self.load_error}).")

        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = Path(tmp.name)

        try:
            with rasterio.open(tmp_path) as src:
                raw = src.read().astype(np.float32)
                bounds = [float(b) for b in src.bounds] if src.bounds is not None else None
                crs = str(src.crs) if src.crs is not None else None
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

        band_mean = np.mean(raw, axis=(1, 2), keepdims=True).astype(np.float32)
        band_std = np.std(raw, axis=(1, 2), keepdims=True).astype(np.float32)
        model_norm = ((raw - band_mean) / np.maximum(band_std, 1e-6)).astype(np.float32)

        hwc = np.ascontiguousarray(np.transpose(model_norm, (1, 2, 0)), dtype=np.float32)
        resized = cv2.resize(hwc, (256, 256), interpolation=cv2.INTER_LINEAR)
        chw = np.ascontiguousarray(np.transpose(resized, (2, 0, 1)), dtype=np.float32)
        tensor_in = torch.from_numpy(chw).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            logits = self.model(tensor_in)["out"]
            prob_map = torch.sigmoid(logits).squeeze().cpu().numpy().astype(np.float32)

        prob_map = cv2.resize(prob_map, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
        pred_mask = (prob_map >= float(threshold)).astype(np.uint8)

        burnt_pixels = int(np.count_nonzero(pred_mask))
        total_pixels = int(pred_mask.size)
        burnt_pct = round((burnt_pixels / max(total_pixels, 1)) * 100.0, 2)
        burnt_area_ha = round((burnt_pixels * pixel_area_m2) / 10_000.0, 2)
        nbr = (raw[3] - raw[5]) / (raw[3] + raw[5] + 1e-6)
        mean_nbr = round(float(np.mean(nbr)), 3)

        p2 = np.percentile(raw, 2, axis=(1, 2), keepdims=True).astype(np.float32)
        p98 = np.percentile(raw, 98, axis=(1, 2), keepdims=True).astype(np.float32)
        vis_norm = np.clip((raw - p2) / np.maximum(p98 - p2, 1e-6), 0.0, 1.0).astype(np.float32)

        rgb_uint8 = np.ascontiguousarray(
            (np.stack([vis_norm[2], vis_norm[1], vis_norm[0]], axis=-1) * 255.0).clip(0, 255),
            dtype=np.uint8,
        )
        false_color_uint8 = np.ascontiguousarray(
            (np.stack([vis_norm[5], vis_norm[3], vis_norm[2]], axis=-1) * 255.0).clip(0, 255),
            dtype=np.uint8,
        )

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