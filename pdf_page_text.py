"""Extract one PDF page from stdin; use local OCR when no text layer exists."""

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MAX_PDF_BYTES = 20 * 1024 * 1024
MAX_TEXT_CHARS = 16000


def tool_path(name: str):
    configured = os.environ.get(f"REMNOTE_{name.upper()}")
    candidates = [configured, shutil.which(name)]
    if os.name == "nt":
        if name == "pdftoppm":
            candidates.append(str(Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe"))
        if name == "tesseract":
            candidates.append(str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Tesseract-OCR/tesseract.exe"))
    return next((item for item in candidates if item and Path(item).is_file()), None)


def extract(pdf_bytes: bytes, page: int):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PYPDF_UNAVAILABLE") from exc
    reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
    page_count = len(reader.pages)
    if page > page_count:
        raise RuntimeError("PDF_PAGE_OUT_OF_RANGE")
    text = reader.pages[page - 1].extract_text() or ""
    method = "text_layer"
    ocr_language = None
    if len(text.strip()) < 20:
        poppler = tool_path("pdftoppm")
        tesseract = tool_path("tesseract")
        if not poppler or not tesseract:
            raise RuntimeError("PDF_OCR_UNAVAILABLE")
        with tempfile.TemporaryDirectory(prefix="remnote-pdf-read-") as directory:
            pdf_path = Path(directory) / "input.pdf"
            image_root = Path(directory) / "page"
            pdf_path.write_bytes(pdf_bytes)
            render = subprocess.run(
                [poppler, "-f", str(page), "-l", str(page), "-r", "180", "-singlefile", "-png", str(pdf_path), str(image_root)],
                capture_output=True, timeout=45, check=False,
            )
            if render.returncode != 0 or not image_root.with_suffix(".png").is_file():
                raise RuntimeError("PDF_RENDER_FAILED")
            ocr_language = "eng"
            ocr = subprocess.run(
                [tesseract, str(image_root.with_suffix(".png")), "stdout", "-l", ocr_language],
                capture_output=True, timeout=45, check=False,
            )
            if ocr.returncode != 0:
                raise RuntimeError("PDF_OCR_FAILED")
            text = ocr.stdout.decode("utf-8", errors="replace")
            method = "ocr"
    return {
        "ok": True, "page": page, "pageCount": page_count, "method": method,
        "ocrLanguage": ocr_language, "text": text[:MAX_TEXT_CHARS],
        "truncated": len(text) > MAX_TEXT_CHARS,
    }


def main():
    try:
        page = int(sys.argv[1])
        if page < 1 or page > 500:
            raise RuntimeError("INVALID_PDF_PAGE")
        data = sys.stdin.buffer.read(MAX_PDF_BYTES + 1)
        if len(data) > MAX_PDF_BYTES:
            raise RuntimeError("PDF_TOO_LARGE")
        if not data.startswith(b"%PDF-"):
            raise RuntimeError("PDF_INVALID_CONTENT")
        result = extract(data, page)
    except RuntimeError as exc:
        result = {"ok": False, "errorCode": str(exc)}
    except Exception:
        result = {"ok": False, "errorCode": "PDF_EXTRACTION_FAILED"}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
