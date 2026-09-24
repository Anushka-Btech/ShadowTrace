from __future__ import annotations

import base64
import io
import logging
from dataclasses import asdict, dataclass
from typing import Any

import requests
from PIL import Image, ImageChops, ImageEnhance, ExifTags

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15


@dataclass(slots=True)
class DeepfakeDetectionResult:
    manipulation_probability: float
    ela_image_base64: str
    metadata_summary: dict[str, Any]
    ai_generated_probability: float | None = None
    ai_model_used: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _download_image(image_url: str) -> tuple[Image.Image, bytes]:
    # Wikimedia and most CDNs reject the default python-requests user agent
    headers = {"User-Agent": "ShadowTrace/1.0 (image forensics; contact: admin@shadowtrace.app)"}
    response = requests.get(image_url, headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert("RGB"), response.content


def _read_exif_metadata(image: Image.Image) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    try:
        exif = image.getexif()
    except Exception:
        exif = None
    if not exif:
        return summary
    for key, value in exif.items():
        name = ExifTags.TAGS.get(key, str(key))
        if isinstance(value, bytes):
            try:
                value = value.decode("utf-8", errors="ignore")
            except Exception:
                value = value.hex()
        elif not isinstance(value, (str, int, float, bool)):
            # EXIF can hold IFDRational and other non-JSON types
            value = str(value)
        summary[name] = value
    return summary


def _compute_ela(image: Image.Image, quality: int = 90) -> tuple[Image.Image, float]:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality)
    buffer.seek(0)
    compressed = Image.open(buffer).convert("RGB")
    diff = ImageChops.difference(image, compressed)
    extrema = diff.getextrema()
    max_diff = max((pair[1] for pair in extrema), default=1) or 1
    scale = 255.0 / max_diff
    ela = ImageEnhance.Brightness(diff).enhance(scale)
    return ela, float(max_diff)


def _ela_to_base64(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _manipulation_probability(exif_summary: dict[str, Any], ela_max_diff: float) -> float:
    score = 0.15
    if not exif_summary:
        score += 0.2
    if "Software" in exif_summary:
        score += 0.15
    if "DateTime" not in exif_summary:
        score += 0.05
    if ela_max_diff > 25:
        score += 0.25
    elif ela_max_diff > 10:
        score += 0.15
    return round(min(0.99, score), 4)


class DeepfakeDetector:
    def analyze(self, image_url: str) -> DeepfakeDetectionResult:
        try:
            image, raw_bytes = _download_image(image_url)
            metadata_summary = _read_exif_metadata(image)
            ela_image, ela_max_diff = _compute_ela(image)
            heuristic_probability = _manipulation_probability(metadata_summary, ela_max_diff)

            # Trained AI-generation classifier (needs HF_API_KEY; None without)
            ai_generated_probability: float | None = None
            ai_model_used: str | None = None
            try:
                from agents.ai_image_detector import detect_ai_image

                model_result = detect_ai_image(raw_bytes)
                if model_result is not None:
                    ai_generated_probability = model_result["ai_probability"]
                    ai_model_used = model_result["model"]
            except Exception as exc:
                logger.info("AI-image model unavailable: %s", exc)

            # AI-generation and manual editing are separate questions: a
            # confident AI flag raises the score, but "not AI-generated"
            # must not veto the ELA/EXIF editing forensics
            if ai_generated_probability is not None and ai_generated_probability >= 0.5:
                manipulation_probability = round(
                    min(0.99, 0.6 * ai_generated_probability + 0.4 * heuristic_probability), 4
                )
            else:
                manipulation_probability = heuristic_probability

            return DeepfakeDetectionResult(
                manipulation_probability=manipulation_probability,
                ela_image_base64=_ela_to_base64(ela_image),
                metadata_summary=metadata_summary,
                ai_generated_probability=ai_generated_probability,
                ai_model_used=ai_model_used,
            )
        except Exception as exc:
            logger.exception("Deepfake analysis failed for %s: %s", image_url, exc)
            return DeepfakeDetectionResult(
                manipulation_probability=0.0,
                ela_image_base64="",
                metadata_summary={"error": str(exc), "analysis_failed": True},
            )
