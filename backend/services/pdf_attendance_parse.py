"""
Multi-layer PDF attendance report parsing (tables → text regex → optional OCR).
Expects "Date wise Daily Attendance" style exports with EMP Code, In Time, Out Time.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from io import BytesIO
from typing import List, Optional, Tuple

_TRUNC = 12000

DATE_HEADER_PATTERNS = (
    re.compile(
        r"(?:On\s+Dated\s*:|Date\s*:)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})",
        re.I,
    ),
)


@dataclass(frozen=True)
class PdfRowParse:
    pdf_row_index: int
    emp_code: str
    in_time: Optional[str]
    out_time: Optional[str]


def _norm_header(cell: str | None) -> str:
    return re.sub(r"\s+", " ", (cell or "").strip().lower())


def _find_report_date(text: str) -> Optional[date]:
    for rx in DATE_HEADER_PATTERNS:
        m = rx.search(text)
        if m:
            dd, mm, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if yy < 100:
                yy += 2000
            try:
                return date(yy, mm, dd)
            except ValueError:
                continue
    return None


_time_re = re.compile(r"\b\d{1,2}:\d{2}\b")


def _norm_time(t: str | None) -> Optional[str]:
    if t is None:
        return None
    s = str(t).strip()
    if not s or s.upper() in {"-", "—"}:
        return None
    m = _time_re.search(s)
    if not m:
        return None
    return m.group(0)


def _table_to_rows(table: List[List[Optional[str]]], start_index: int) -> List[PdfRowParse]:
    """Map a pdfplumber-style table to PdfRowParse using header row semantics."""
    if not table or len(table) < 2:
        return []
    header_raw = table[0]
    headers = [_norm_header(c) for c in header_raw]

    def idx(*needles: str) -> Optional[int]:
        for i, h in enumerate(headers):
            ok = True
            for n in needles:
                if n not in h:
                    ok = False
                    break
            if ok:
                return i
        return None

    def idx_emp_code() -> Optional[int]:
        j = idx("emp", "code")
        if j is not None:
            return j
        for i, h in enumerate(headers):
            if "emp" in h and "code" in h:
                return i
            if h.strip() == "code" or h.endswith(" code"):
                return i
        return None

    i_emp = idx_emp_code()
    i_in = idx("in", "time")
    i_out = idx("out", "time")
    if i_emp is None or i_in is None or i_out is None:
        return []

    out: List[PdfRowParse] = []
    seq = start_index
    for data_row in table[1:]:
        if not data_row or len(data_row) <= max(i_emp, i_in, i_out):
            continue
        emp_raw = (data_row[i_emp] or "").strip()
        if not emp_raw or not re.sub(r"\D", "", emp_raw):
            continue
        emp_code = re.sub(r"\s+", "", emp_raw.split()[0]) if emp_raw else ""
        if not emp_code:
            continue
        in_t = _norm_time(str(data_row[i_in] or "").strip() or None)
        out_t = _norm_time(str(data_row[i_out] or "").strip() or None)
        # Skip obvious header repeats
        if emp_code.lower() in {"emp", "code", "card"}:
            continue
        seq += 1
        out.append(PdfRowParse(pdf_row_index=seq, emp_code=emp_code, in_time=in_t, out_time=out_t))
    return out


def _extract_tables_layer(pdf_bytes: bytes) -> Tuple[Optional[date], List[PdfRowParse], str]:
    import pdfplumber

    excerpt = ""
    all_rows: List[PdfRowParse] = []
    report_date: Optional[date] = None
    seq = 0
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            excerpt += (page.extract_text() or "") + "\n"
            for table in page.extract_tables() or []:
                if not table:
                    continue
                rows = _table_to_rows(table, seq)
                seq = max((r.pdf_row_index for r in rows), default=seq)
                all_rows.extend(rows)
    rd = _find_report_date(excerpt)
    return rd, all_rows, excerpt[:_TRUNC]


def _text_lines_layer(text: str) -> List[PdfRowParse]:
    rows: List[PdfRowParse] = []
    seq = 0
    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) < 5:
            continue
        if not re.match(r"^\d+\s+", line):
            continue
        parts = re.split(r"\s{2,}|\t+", line)
        if len(parts) < 4:
            parts = line.split()
        if len(parts) < 4:
            continue
        try:
            emp_code = re.sub(r"\D", "", parts[1]) or re.sub(r"\D", "", parts[0])
            if not emp_code:
                continue
        except IndexError:
            continue
        times = _time_re.findall(line)
        if len(times) < 2:
            continue
        # Heuristic: last two non-shift times are often In/Out after fixed shift pair 9:00 18:00
        if len(times) >= 4:
            in_t, out_t = times[2], times[3]
        else:
            in_t, out_t = times[0], times[1]
        seq += 1
        rows.append(
            PdfRowParse(
                pdf_row_index=seq,
                emp_code=emp_code,
                in_time=_norm_time(in_t),
                out_time=_norm_time(out_t),
            )
        )
    return rows


def _ocr_text(pdf_bytes: bytes) -> str:
    """Render first page to image and OCR; returns empty string if unavailable."""
    try:
        import fitz  # PyMuPDF
        from PIL import Image
        import pytesseract
    except Exception:
        return ""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if doc.page_count < 1:
            return ""
        page = doc.load_page(0)
        mat = fitz.Matrix(2.0, 2.0)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        doc.close()
        return pytesseract.image_to_string(img) or ""
    except Exception:
        return ""


def parse_attendance_pdf(pdf_bytes: bytes) -> Tuple[Optional[date], List[PdfRowParse], str]:
    """
    Returns (report_date, parsed_rows, excerpt_for_logs).
    Never raises; callers handle empty rows.
    """
    excerpt = ""
    try:
        rd, rows, excerpt = _extract_tables_layer(pdf_bytes)
        if rows:
            return rd or _find_report_date(excerpt), rows, excerpt
        text = excerpt
        rd = rd or _find_report_date(text)
        rows = _text_lines_layer(text)
        if rows:
            return rd, rows, excerpt
        ocr = _ocr_text(pdf_bytes)
        if ocr:
            excerpt = (text + "\n--- OCR ---\n" + ocr)[:_TRUNC]
            rd = rd or _find_report_date(ocr)
            rows = _text_lines_layer(ocr)
        return rd, rows, excerpt[:_TRUNC]
    except Exception as exc:
        return None, [], f"[parse error] {exc!s}"[:_TRUNC]
