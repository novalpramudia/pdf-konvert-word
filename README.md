# PDF to Word Converter (Flask)

## Tech Stack
- Flask (Python)
- Frontend: HTML5 + Tailwind CSS + Vanilla JS
- Conversion: `pdf2docx` (+ optional PyMuPDF)

## Run Local
1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start server:
   ```bash
   python app.py
   ```
3. Open:
   - http://127.0.0.1:5000

## Notes
- Temporary files are deleted automatically after conversion.
- File validation enforces PDF-only and a max size (100MB).
- Conversion is executed server-side (Flask + pdf2docx). 


