import base64
import gc
from pathlib import Path
import tempfile
import threading
import traceback

import cv2
import numpy as np
import rasterio

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "deeplabv3_burnt_best.pth"

PIXEL_AREA_M2 = 100       # 10m x 10m Sentinel-2 spatial resolution
TILE_SIZE = 256           # Matches 256x256 training patch size
TILE_STRIDE = 192         # 64px overlap eliminates tile boundary seams
MAX_RASTER_DIM = 2048     # Guardrail against multi-GB GeoTIFF OOM on 512MB RAM


def find_verified_weights(expected_path: Path = MODEL_PATH) -> Path:
    """Locate pre-built weights on disk without triggering a runtime network spike."""
    candidates = [expected_path]
    if MODELS_DIR.exists():
        candidates.extend(
            p for p in MODELS_DIR.rglob("*.pth") if p != expected_path
        )

    for path in candidates:
        if path.is_file() and path.stat().st_size > 10_000_000:
            with open(path, "rb") as f:
                if f.read(4) == b"PK\x03\x04":
                    return path

    raise FileNotFoundError(
        f"Valid DeepLabV3 weights not found in {MODELS_DIR}. "
        "Ensure the Render Build Command downloads and extracts deeplabv3_burnt_best.pth."
    )


class BurnScarSegmenter:
    def __init__(self, weights_path: Path = MODEL_PATH):
        self.weights_path = weights_path
        self.model = None
        self.loaded = False
        self.load_error = None
        self._load_lock = threading.Lock()

    def _load_weights(self) -> None:
        if self.loaded and self.model is not None:
            return

        with self._load_lock:
            if self.loaded and self.model is not None:
                return

            import torch
            import torch.nn as nn
            from torchvision.models.segmentation import deeplabv3_resnet50

            torch.set_num_threads(1)

            try:
                resolved_path = find_verified_weights(self.weights_path)
                self.weights_path = resolved_path
                gc.collect()

                ckpt = torch.load(
                    resolved_path, map_location="cpu", mmap=True, weights_only=True
                )
                state_dict = (
                    ckpt["model_state_dict"]
                    if isinstance(ckpt, dict) and "model_state_dict" in ckpt
                    else ckpt
                )
                has_aux = any(
                    k.startswith("aux_classifier.") for k in state_dict.keys()
                )

                with torch.device("meta"):
                    model = deeplabv3_resnet50(
                        weights=None, weights_backbone=None, aux_loss=has_aux
                    )
                    old_conv = model.backbone.conv1
                    model.backbone.conv1 = nn.Conv2d(
                        6,
                        old_conv.out_channels,
                        kernel_size=7,
                        stride=2,
                        padding=3,
                        bias=False,
                    )
                    model.classifier[4] = nn.Conv2d(256, 1, kernel_size=1)
                    if has_aux and model.aux_classifier is not None:
                        model.aux_classifier[4] = nn.Conv2d(256, 1, kernel_size=1)

                incompatible = model.load_state_dict(
                    state_dict, strict=False, assign=True
                )
                if incompatible.missing_keys or incompatible.unexpected_keys:
                    print(
                        f"Checkpoint keys — missing: {incompatible.missing_keys}, "
                        f"unexpected: {incompatible.unexpected_keys}"
                    )
                if incompatible.missing_keys:
                    raise RuntimeError(
                        f"Checkpoint missing required keys: {incompatible.missing_keys}"
                    )

                del ckpt, state_dict
                gc.collect()

                model.eval()
                self.model = model
                self.loaded = True
                self.load_error = None
                print(f"DeepLabV3 loaded from {resolved_path} (meta + mmap + assign).")
            except Exception as e:
                traceback.print_exc()
                self.load_error = f"{type(e).__name__}: {e}"
                self.model = None
                self.loaded = False

    @staticmethod
    def _encode_png(img_rgb: np.ndarray) -> str:
        img_bgr = (
            cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR) if img_rgb.ndim == 3 else img_rgb
        )
        _, buffer = cv2.imencode(".png", img_bgr)
        return f"data:image/png;base64,{base64.b64encode(buffer).decode('utf-8')}"

    @staticmethod
    def _tile_positions(length: int, tile: int, stride: int) -> list[int]:
        if length <= tile:
            return [0]
        starts = list(range(0, length - tile + 1, stride))
        if starts[-1] != length - tile:
            starts.append(length - tile)
        return starts

    def _infer_tiled(self, model_norm: np.ndarray) -> np.ndarray:
        """Pad small edges (no distortion) and blend overlapping 256x256 tiles."""
        import torch

        _, h, w = model_norm.shape
        pad_h = max(0, TILE_SIZE - h)
        pad_w = max(0, TILE_SIZE - w)

        if pad_h > 0 or pad_w > 0:
            padded = np.pad(
                model_norm, ((0, 0), (0, pad_h), (0, pad_w)), mode="reflect"
            )
        else:
            padded = model_norm

        _, ph, pw = padded.shape
        prob_acc = np.zeros((ph, pw), dtype=np.float32)
        weight_acc = np.zeros((ph, pw), dtype=np.float32)

        # Smooth 2D tent window so overlapping tiles blend without grid seams
        w1d = np.hanning(TILE_SIZE + 2)[1:-1].astype(np.float32)
        w1d = np.maximum(w1d, 1e-3)
        tile_weight = np.outer(w1d, w1d)

        ys = self._tile_positions(ph, TILE_SIZE, TILE_STRIDE)
        xs = self._tile_positions(pw, TILE_SIZE, TILE_STRIDE)

        with torch.inference_mode():
            for y0 in ys:
                for x0 in xs:
                    patch = np.ascontiguousarray(
                        padded[:, y0 : y0 + TILE_SIZE, x0 : x0 + TILE_SIZE],
                        dtype=np.float32,
                    )
                    tensor_in = torch.from_numpy(patch).unsqueeze(0)
                    logits = self.model(tensor_in)["out"]
                    tile_prob = (
                        torch.sigmoid(logits).squeeze().cpu().numpy().astype(np.float32)
                    )
                    del tensor_in, logits

                    prob_acc[y0 : y0 + TILE_SIZE, x0 : x0 + TILE_SIZE] += (
                        tile_prob * tile_weight
                    )
                    weight_acc[y0 : y0 + TILE_SIZE, x0 : x0 + TILE_SIZE] += tile_weight

        if padded is not model_norm:
            del padded
        prob_map = (prob_acc / np.maximum(weight_acc, 1e-6))[:h, :w]
        del prob_acc, weight_acc
        gc.collect()
        return prob_map

    def predict_tif(
        self, tmp_path: Path, filename: str, threshold: float = 0.5
    ) -> dict:
        if not self.loaded or self.model is None:
            self._load_weights()
        if not self.loaded or self.model is None:
            raise RuntimeError(
                f"DeepLabV3 model weights are unavailable ({self.load_error})."
            )

        with rasterio.open(tmp_path) as src:
            if src.count < 6:
                raise ValueError(
                    f"Expected a 6-band Sentinel-2 GeoTIFF, but received {src.count} band(s)."
                )
            if src.height > MAX_RASTER_DIM or src.width > MAX_RASTER_DIM:
                raise ValueError(
                    f"Raster dimensions ({src.width}x{src.height}) exceed the "
                    f"{MAX_RASTER_DIM}x{MAX_RASTER_DIM} limit for free-tier memory."
                )

            raw = src.read([1, 2, 3, 4, 5, 6]).astype(np.float32)
            bounds = (
                [float(b) for b in src.bounds] if src.bounds is not None else None
            )
            crs = str(src.crs) if src.crs is not None else None
            if (
                src.crs is not None
                and src.crs.is_projected
                and src.transform is not None
            ):
                pixel_area_m2 = abs(float(src.transform.a) * float(src.transform.e))
            else:
                pixel_area_m2 = float(PIXEL_AREA_M2)

        raw = np.nan_to_num(raw, nan=0.0, posinf=0.0, neginf=0.0, copy=False)
        orig_h, orig_w = int(raw.shape[1]), int(raw.shape[2])

        # 1. Model inference (free normalized copy immediately after inference)
        band_mean = np.mean(raw, axis=(1, 2), keepdims=True).astype(np.float32)
        band_std = np.std(raw, axis=(1, 2), keepdims=True).astype(np.float32)
        model_norm = ((raw - band_mean) / np.maximum(band_std, 1e-6)).astype(np.float32)

        prob_map = self._infer_tiled(model_norm)
        del model_norm
        gc.collect()

        # 2. Quantitative burn metrics & NBR
        pred_mask = (prob_map >= float(threshold)).astype(np.uint8)
        del prob_map

        burnt_pixels = int(np.count_nonzero(pred_mask))
        total_pixels = int(pred_mask.size)
        burnt_pct = round((burnt_pixels / max(total_pixels, 1)) * 100.0, 2)
        burnt_area_ha = round((burnt_pixels * pixel_area_m2) / 10_000.0, 2)

        nbr = (raw[3] - raw[5]) / (raw[3] + raw[5] + 1e-6)
        mean_nbr = round(float(np.mean(nbr)), 3)
        del nbr

        # 3. Render & encode visualizations sequentially to avoid RAM spikes
        def stretch_band(band_idx: int) -> np.ndarray:
            b = raw[band_idx]
            lo, hi = np.percentile(b, (2, 98))
            scaled = np.clip((b - lo) / max(float(hi - lo), 1e-6), 0.0, 1.0)
            return (scaled * 255.0).astype(np.uint8)

        r_u8 = stretch_band(2)
        g_u8 = stretch_band(1)
        b_u8 = stretch_band(0)
        rgb_uint8 = np.ascontiguousarray(np.stack([r_u8, g_u8, b_u8], axis=-1))
        del r_u8, g_u8, b_u8
        true_color_b64 = self._encode_png(rgb_uint8)

        swir_u8 = stretch_band(5)
        nir_u8 = stretch_band(3)
        red_u8 = stretch_band(2)
        del raw
        gc.collect()

        false_color_uint8 = np.ascontiguousarray(
            np.stack([swir_u8, nir_u8, red_u8], axis=-1)
        )
        del swir_u8, nir_u8, red_u8
        false_color_b64 = self._encode_png(false_color_uint8)
        del false_color_uint8

        mask_bool = pred_mask > 0
        if np.any(mask_bool):
            rgb_uint8[mask_bool, 0] = (
                rgb_uint8[mask_bool, 0].astype(np.float32) * 0.55 + 255.0 * 0.45
            ).astype(np.uint8)
            rgb_uint8[mask_bool, 1] = (
                rgb_uint8[mask_bool, 1].astype(np.float32) * 0.55
            ).astype(np.uint8)
            rgb_uint8[mask_bool, 2] = (
                rgb_uint8[mask_bool, 2].astype(np.float32) * 0.55
            ).astype(np.uint8)
        overlay_b64 = self._encode_png(rgb_uint8)
        del rgb_uint8, mask_bool

        mask_vis = np.ascontiguousarray(pred_mask * 255, dtype=np.uint8)
        del pred_mask
        burn_mask_b64 = self._encode_png(mask_vis)
        del mask_vis
        gc.collect()

        return {
            "filename": str(filename),
            "dimensions": f"{orig_w}x{orig_h}",
            "crs": crs,
            "bounds": bounds,
            "burnt_percentage": burnt_pct,
            "burnt_area_ha": burnt_area_ha,
            "mean_nbr": mean_nbr,
            "images": {
                "true_color": true_color_b64,
                "false_color": false_color_b64,
                "burn_mask": burn_mask_b64,
                "overlay": overlay_b64,
            },
        }


segmenter = BurnScarSegmenter()