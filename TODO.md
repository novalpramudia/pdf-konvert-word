# TODO - PDF to Word Converter (Flask)

## Plan (ringkas)
1. Buat `requirements.txt`.
2. Buat backend Flask di `app.py`:
   - Routes: `GET /` dan `POST /convert`
   - Validasi PDF (hanya .pdf, max 100MB)
   - Simpan sementara di `uploads/`, hasil di `outputs/`
   - Convert via `pdf2docx` menjadi `.docx`
   - Auto-delete file sementara setelah sukses/gagal
   - Streaming/download DOCX
3. Buat frontend:
   - `templates/index.html` (Tailwind UI premium look, dark/light mode, SEO)
   - `static/css/style.css` (theme, card radius 18px, shadows, animasi)
   - `static/js/script.js` (drag & drop, progress bar dengan polling berbasis request progress via server-sent events/interval jika diperlukan, toast, error handling, auto download)
4. Buat folder `uploads/` dan `outputs/` agar siap.
5. Tes lokal:
   - Upload PDF kecil & besar (cek validasi 100MB)
   - Cek output DOCX ter-download
6. Dokumentasi singkat di `README.md` (run command + catatan lokal/hosting).

## Checklist
- [ ] requirements.txt
- [ ] app.py
- [ ] templates/index.html
- [ ] static/css/style.css
- [ ] static/js/script.js
- [x] Buat folder uploads/outputs (placeholder via file)

- [x] Testing local conversion (server up on 127.0.0.1:5000)

- [ ] Final polish & pastikan semua kode lengkap (tanpa placeholder)

