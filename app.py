import os
import uuid
import time
from datetime import datetime

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    send_file,
    abort,
    url_for,
)
from werkzeug.utils import secure_filename

from pdf2docx import Converter

# Optional dependency (not required for pdf2docx conversion, but installed per requirements)
try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover
    fitz = None


APP_ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(APP_ROOT, "uploads")
OUTPUT_DIR = os.path.join(APP_ROOT, "outputs")

# Ensure required folders exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# App config
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB
ALLOWED_EXTENSIONS = {".pdf"}

# In-memory progress store (works for local/single-process). For production multi-worker,
# replace with Redis/DB.
PROGRESS = {}

app = Flask(__name__)
app.config.update(
    MAX_CONTENT_LENGTH=MAX_CONTENT_LENGTH,
)


def allowed_file(filename: str) -> bool:
    _, ext = os.path.splitext(filename.lower())
    return ext in ALLOWED_EXTENSIONS


def safe_uuid() -> str:
    return uuid.uuid4().hex


def get_pdf_info(pdf_path: str) -> dict:
    """Return basic PDF metadata for UI (page count)."""
    info = {"pages": None}
    if fitz is None:
        return info

    try:
        doc = fitz.open(pdf_path)
        info["pages"] = doc.page_count
        doc.close()
    except Exception:
        info["pages"] = None
    return info


def convert_pdf_to_docx(job_id: str, pdf_path: str, output_path: str) -> None:
    """Convert using pdf2docx. Update progress along the way."""

    # Initial
    PROGRESS[job_id] = {
        "status": "queued",
        "progress": 0,
        "message": "Uploading...",
        "started_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

    def update(pct: int, status: str, message: str):
        PROGRESS[job_id] = {
            **PROGRESS.get(job_id, {}),
            "status": status,
            "progress": int(pct),
            "message": message,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }

    # Staged messages similar to the requirement
    update(5, "uploading", "Uploading...")
    time.sleep(0.1)

    update(45, "converting", "Converting...")

    # pdf2docx doesn't expose incremental progress reliably. We provide a smooth approximation.
    # Conversion itself:
    converter = None
    try:
        update(60, "converting", "Converting...")
        converter = Converter(pdf_path)

        # Convert; keep default params for quality.
        # Note: pdf2docx handles layout extraction internally.
        converter.convert(output_path, start=0, end=None)

        update(97, "almost_done", "Almost Done...")
        time.sleep(0.05)
        update(100, "success", "Conversion Successful")
    finally:
        if converter is not None:
            try:
                converter.close()
            except Exception:
                pass


@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")


@app.route("/convert", methods=["POST"])
def convert():
    """Receive PDF upload, save temp file, convert synchronously, and return job_id."""

    if "pdf" not in request.files:
        return jsonify({"ok": False, "error": "No file provided."}), 400

    file = request.files["pdf"]
    if not file or file.filename is None:
        return jsonify({"ok": False, "error": "No file selected."}), 400

    filename = secure_filename(file.filename)
    if not filename.lower().endswith(".pdf"):
        return jsonify({"ok": False, "error": "Only PDF files are allowed."}), 400

    # Size validation (MAX_CONTENT_LENGTH also enforces, but we keep explicit check)
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_CONTENT_LENGTH:
        return jsonify({"ok": False, "error": "File too large. Max 100MB."}), 400

    job_id = safe_uuid()
    temp_pdf_path = os.path.join(UPLOAD_DIR, f"{job_id}_{filename}")
    output_docx_path = os.path.join(OUTPUT_DIR, f"{job_id}_{os.path.splitext(filename)[0]}.docx")

    # Save uploaded PDF
    file.save(temp_pdf_path)

    # Basic info for UI
    pdf_info = get_pdf_info(temp_pdf_path)

    # Convert synchronously but keep progress observable by polling immediately after call.
    # For better UX, a production deployment could move conversion to a background worker.
    try:
        convert_pdf_to_docx(job_id, temp_pdf_path, output_docx_path)

        # Cleanup temp file
        try:
            os.remove(temp_pdf_path)
        except FileNotFoundError:
            pass

        return jsonify(
            {
                "ok": True,
                "job_id": job_id,
                "file": {
                    "original_name": filename,
                    "size_bytes": size,
                    "pages": pdf_info.get("pages"),
                    "output_path_exists": os.path.exists(output_docx_path),
                },
                "download_url": url_for("download", job_id=job_id, _external=False),
            }
        )
    except Exception as e:
        # Cleanup temp if failed
        try:
            if os.path.exists(temp_pdf_path):
                os.remove(temp_pdf_path)
        except Exception:
            pass

        PROGRESS[job_id] = {
            "status": "error",
            "progress": PROGRESS.get(job_id, {}).get("progress", 0),
            "message": f"Conversion failed: {str(e)}",
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }

        return jsonify({"ok": False, "error": "Conversion failed."}), 500


@app.route("/progress/<job_id>", methods=["GET"])
def progress(job_id: str):
    data = PROGRESS.get(job_id)
    if not data:
        return jsonify({"ok": False, "error": "Job not found."}), 404
    return jsonify({"ok": True, "data": data})


@app.route("/download/<job_id>", methods=["GET"])
def download(job_id: str):
    # Find the output file by prefix job_id_*.docx
    for name in os.listdir(OUTPUT_DIR):
        if name.startswith(f"{job_id}_") and name.lower().endswith(".docx"):
            full_path = os.path.join(OUTPUT_DIR, name)
            # Auto-delete output after download by streaming callback (best-effort).
            # Flask send_file doesn't support callback easily; we delete after sending.
            # We'll schedule deletion using after_this_request.
            from flask import after_this_request

            @after_this_request
            def remove_file(response):
                try:
                    os.remove(full_path)
                except Exception:
                    pass
                return response

            return send_file(
                full_path,
                as_attachment=True,
                download_name=name,
                mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

    abort(404)


@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"ok": False, "error": "File too large. Max 100MB."}), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({"ok": False, "error": "Server error."}), 500


if __name__ == "__main__":
    # For local testing
    app.run(host="127.0.0.1", port=5000, debug=True)

