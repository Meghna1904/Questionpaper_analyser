"""
OCR Diagnostic Test Script (ASCII-safe for Windows PowerShell)
"""

import fitz  # PyMuPDF
import re
import sys
import os

# Tesseract path
try:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    HAS_TESSERACT = True
except ImportError:
    pytesseract = None
    HAS_TESSERACT = False

try:
    from pdf2image import convert_from_path
    POPPLER_PATHS = [
        r"C:\poppler\Library\bin",
        r"C:\poppler-windows\Library\bin",
        r"C:\tools\poppler\bin",
        r"C:\poppler\bin",
    ]
    POPPLER_PATH = next((p for p in POPPLER_PATHS if os.path.exists(p)), None)
    HAS_PDF2IMAGE = True
except ImportError:
    convert_from_path = None
    POPPLER_PATH = None
    HAS_PDF2IMAGE = False


def extract_text_pymupdf(pdf_path):
    doc = fitz.open(pdf_path)
    full_text = []
    for page_num, page in enumerate(doc):
        text = page.get_text()
        full_text.append(f"[PAGE {page_num+1}]\n{text}")
    doc.close()
    return "\n".join(full_text)


def is_text_valid(text, min_chars_per_page=150):
    pages = [p for p in text.split("[PAGE") if p.strip()]
    if not pages:
        return False
    total_real_chars = sum(len(re.sub(r'\s+', '', page)) for page in pages)
    avg_per_page = total_real_chars / max(len(pages), 1)
    print(f"  PyMuPDF avg chars/page: {avg_per_page:.0f} (threshold: {min_chars_per_page})")
    return avg_per_page >= min_chars_per_page


def extract_text_ocr(pdf_path):
    if not HAS_PDF2IMAGE:
        return None, "pdf2image not installed"
    if not HAS_TESSERACT:
        return None, "pytesseract not installed"
    if not os.path.exists(pytesseract.pytesseract.tesseract_cmd):
        return None, f"Tesseract binary not found at: {pytesseract.pytesseract.tesseract_cmd}"
    
    try:
        kwargs = {"dpi": 300}
        if POPPLER_PATH:
            kwargs["poppler_path"] = POPPLER_PATH
        images = convert_from_path(pdf_path, **kwargs)
        full_text = []
        for i, img in enumerate(images):
            text = pytesseract.image_to_string(img, lang="eng")
            full_text.append(f"[PAGE {i+1}]\n{text}")
        return "\n".join(full_text), None
    except Exception as e:
        return None, str(e)


def fix_ocr_errors(text):
    text = re.sub(r'\bQl\b', 'Q1', text)
    text = re.sub(r'\bQ\|', 'Q1', text)
    text = re.sub(r'\bOl\b', 'Q1', text)
    text = re.sub(r'\bl\)', '1)', text)
    text = re.sub(r'\ba\]', 'a)', text)
    text = re.sub(r'\bb\]', 'b)', text)
    text = re.sub(r'\bl(\d)', r'1\1', text)
    text = re.sub(r'\s\|\s', ' ', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


QUESTION_START = re.compile(
    r'^(Q\s*\d+|[Qq]uestion\s*\d+|\d+\s*\.|\([a-d]\)|[a-d]\)|[ivxIVX]+\.|Part\s*[AB])',
    re.IGNORECASE
)

def merge_broken_lines(text):
    lines = text.split("\n")
    merged = []
    buffer = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if QUESTION_START.match(line):
            if buffer:
                merged.append(buffer)
            buffer = line
        elif buffer:
            buffer += " " + line
        else:
            merged.append(line)
    if buffer:
        merged.append(buffer)
    return merged


Q_PATTERN = re.compile(r'^Q\s*(\d+)\s*[.:)]?\s*(.*)', re.IGNORECASE)
PART_PATTERN = re.compile(r'Part\s*[--]?\s*([AB])', re.IGNORECASE)
SUB_PATTERN = re.compile(r'^(\(?[a-d]\)|[ivxIVX]+\.)\s*(.*)', re.IGNORECASE)

def extract_questions(merged_lines):
    questions = {"PART_A": [], "PART_B": []}
    current_part = None
    current_main = None

    for line in merged_lines:
        part_match = PART_PATTERN.search(line)
        if part_match:
            current_part = f"PART_{part_match.group(1).upper()}"
            current_main = None
            continue

        q_match = Q_PATTERN.match(line)
        if q_match:
            q_num = int(q_match.group(1))
            q_text = q_match.group(2).strip()
            if current_part:
                current_main = {"q_num": q_num, "text": q_text, "sub_questions": []}
                questions[current_part].append(current_main)
            continue

        sub_match = SUB_PATTERN.match(line)
        if sub_match and current_main is not None:
            current_main["sub_questions"].append({
                "marker": sub_match.group(1),
                "text": sub_match.group(2).strip()
            })
            continue

    return questions


def diagnose_pdf(pdf_path):
    name = os.path.basename(pdf_path)
    print(f"\n{'='*60}")
    print(f"FILE: {name}")
    print(f"{'='*60}")

    print("\n[STEP 1] PyMuPDF extraction...")
    raw_text = extract_text_pymupdf(pdf_path)
    
    tesseract_ok = HAS_TESSERACT and os.path.exists(pytesseract.pytesseract.tesseract_cmd) if HAS_TESSERACT else False

    if is_text_valid(raw_text):
        mode = "DIGITAL (PyMuPDF)"
        print(f"Mode: {mode}")
    else:
        print(f"PyMuPDF text too sparse -> OCR fallback mode")
        print(f"  Tesseract installed: {tesseract_ok}")
        print(f"  pdf2image installed: {HAS_PDF2IMAGE}")
        print(f"  Poppler path found: {POPPLER_PATH}")
        
        if not tesseract_ok or not HAS_PDF2IMAGE:
            print("\n[CANNOT OCR] Missing dependencies. Showing raw PyMuPDF output:")
            print("\n--- RAW PYMUPDF OUTPUT (first 1000 chars) ---")
            print(raw_text[:1000])
            return
        
        print("  Running OCR (may take 30-60 seconds)...")
        raw_text, err = extract_text_ocr(pdf_path)
        if err:
            print(f"OCR ERROR: {err}")
            return
        mode = "SCANNED (OCR)"
        print(f"Mode: {mode}")

    print(f"\n--- RAW TEXT (first 1500 chars) ---")
    # ASCII-safe print
    safe = raw_text[:1500].encode('ascii', errors='replace').decode('ascii')
    print(safe)
    print(f"...\n[Total chars: {len(raw_text)}]")

    print(f"\n[STEP 2] Fixing OCR errors...")
    cleaned = fix_ocr_errors(raw_text)

    print(f"[STEP 3] Reconstructing lines...")
    merged = merge_broken_lines(cleaned)
    print(f"  -> {len(merged)} lines after merge")

    print(f"\n--- ALL MERGED LINES ---")
    for i, line in enumerate(merged):
        safe_line = line[:150].encode('ascii', errors='replace').decode('ascii')
        print(f"  [{i:03d}] {safe_line}")

    print(f"\n[STEP 4] Extracting questions...")
    questions = extract_questions(merged)

    part_a = questions["PART_A"]
    part_b = questions["PART_B"]

    print(f"\nPART A -- {len(part_a)} questions extracted")
    for q in part_a:
        safe_q = q['text'][:120].encode('ascii', errors='replace').decode('ascii')
        print(f"  Q{q['q_num']}: {safe_q}")
        for sub in q["sub_questions"]:
            safe_s = sub['text'][:80].encode('ascii', errors='replace').decode('ascii')
            print(f"       {sub['marker']} {safe_s}")

    print(f"\nPART B -- {len(part_b)} main questions extracted")
    for q in part_b:
        safe_q = q['text'][:120].encode('ascii', errors='replace').decode('ascii')
        print(f"  Q{q['q_num']}: {safe_q}")
        for sub in q["sub_questions"]:
            safe_s = sub['text'][:80].encode('ascii', errors='replace').decode('ascii')
            print(f"       {sub['marker']} {safe_s}")

    if len(part_a) == 0 and len(part_b) == 0:
        print("\nWARNING: No questions extracted! Regex patterns may need adjustment.")


if __name__ == "__main__":
    sample_dir = r"d:\QP extractor\SAmple question paper"
    pdfs = sorted([f for f in os.listdir(sample_dir) if f.endswith(".pdf")])

    if not pdfs:
        print("No PDFs found.")
        sys.exit(1)

    print(f"Found {len(pdfs)} PDFs: {pdfs}")
    
    # Test all PDFs one by one
    for pdf_name in pdfs:
        pdf_path = os.path.join(sample_dir, pdf_name)
        diagnose_pdf(pdf_path)
        print("\n")
