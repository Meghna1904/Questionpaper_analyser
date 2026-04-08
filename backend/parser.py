"""
parser.py — Smart Dual-Mode PDF Question Extractor
====================================================
Handles both digital PDFs (PyMuPDF) and scanned PDFs (OCR fallback).
Tuned for KTU-style (APJ Abdul Kalam Technological University) exam papers:
  - PART A: Questions numbered 1–10 (bare numbers, 3 marks each)
  - PART B: Module I–V, questions 11–20, sub-questions a/b (14 marks each)
"""

import re
import os
import fitz  # PyMuPDF

# ── Optional OCR dependencies ──────────────────────────────────────────────
try:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    HAS_TESSERACT = os.path.exists(pytesseract.pytesseract.tesseract_cmd)
except ImportError:
    pytesseract = None
    HAS_TESSERACT = False

try:
    from pdf2image import convert_from_path
    # Common poppler locations on Windows
    _POPPLER_CANDIDATES = [
        r"C:\poppler\Library\bin",
        r"C:\poppler-windows\Library\bin",
        r"C:\tools\poppler\bin",
        r"C:\poppler\bin",
        r"C:\Program Files\poppler\bin",
    ]
    POPPLER_PATH = next((p for p in _POPPLER_CANDIDATES if os.path.exists(p)), None)
    HAS_PDF2IMAGE = True
except ImportError:
    convert_from_path = None
    POPPLER_PATH = None
    HAS_PDF2IMAGE = False


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 1: Raw text extraction
# ═══════════════════════════════════════════════════════════════════════════

def _extract_digital(pdf_path: str) -> str:
    """Extract embedded text from a digital PDF using PyMuPDF."""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n".join(pages)


def _extract_ocr(pdf_path: str) -> tuple[str, str | None]:
    """Fallback: render each page as image and OCR it."""
    if not HAS_PDF2IMAGE:
        return "", "pdf2image not installed. Run: pip install pdf2image"
    if not HAS_TESSERACT:
        return "", (
            "Tesseract not found. Install from: "
            "https://github.com/UB-Mannheim/tesseract/wiki"
        )
    try:
        kwargs = {"dpi": 300}
        if POPPLER_PATH:
            kwargs["poppler_path"] = POPPLER_PATH
        images = convert_from_path(pdf_path, **kwargs)
        return "\n".join(
            pytesseract.image_to_string(img, lang="eng")
            for img in images
        ), None
    except Exception as e:
        return "", str(e)


def _is_text_sufficient(text: str, min_chars_per_page: int = 300) -> bool:
    """
    Check if PyMuPDF extracted real content.
    PyMuPDF separates pages with form-feed (\\f) characters.
    A real scanned-only PDF will have nearly 0 non-space chars.
    """
    # Split by form-feed (PyMuPDF page separator) or just treat as one block
    pages = [p for p in text.split("\f") if p.strip()]
    if not pages:
        pages = [text]
    avg = sum(len(re.sub(r"\s+", "", p)) for p in pages) / len(pages)
    return avg >= min_chars_per_page



def extract_raw_text(pdf_path: str) -> tuple[str, str, str | None]:
    """
    Main entry: returns (raw_text, mode, error).
    mode = 'digital' | 'ocr'
    error = None on success, string message on failure.
    """
    digital_text = _extract_digital(pdf_path)
    if _is_text_sufficient(digital_text):
        return digital_text, "digital", None
    
    ocr_text, err = _extract_ocr(pdf_path)
    if err:
        # Return what we have from PyMuPDF even if sparse
        return digital_text, "digital_sparse", err
    return ocr_text, "ocr", None


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 2: OCR post-processing (fix character confusion)
# ═══════════════════════════════════════════════════════════════════════════

# Patterns that commonly go wrong in OCR of exam papers
_OCR_FIXES = [
    # Question number confusions (must be before generic fixes)
    (re.compile(r'\bQl\b'),            'Q1'),
    (re.compile(r'\bQ\|\b'),           'Q1'),
    (re.compile(r'\bOl\b'),            'Q1'),
    (re.compile(r'\b(\d+)\s*[|l]\s*([a-d])\)'), r'\1 \2)'),  # "11 l)" → "11 a)"
    # Sub-question markers
    (re.compile(r'\bl\)'),             '1)'),
    (re.compile(r'\ba\]'),             'a)'),
    (re.compile(r'\bb\]'),             'b)'),
    # Numbers confused with letters at word boundaries
    (re.compile(r'(?<!\w)l(\d)'),      r'1\1'),   # "l2" → "12"
    # Stray pipe characters (OCR noise)
    (re.compile(r'\s\|\s'),            ' '),
    # Normalize whitespace
    (re.compile(r'[ \t]+'),            ' '),
    (re.compile(r'\n{4,}'),            '\n\n\n'),
]


def fix_ocr_errors(text: str) -> str:
    for pattern, replacement in _OCR_FIXES:
        text = pattern.sub(replacement, text)
    return text.strip()


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 3: Noise removal (headers, footers, metadata)
# ═══════════════════════════════════════════════════════════════════════════

# Lines to strip: page numbers, exam codes, watermarks
_NOISE_PATTERNS = [
    re.compile(r'^0400CST\d+', re.IGNORECASE),          # Exam code
    re.compile(r'^Page\s+\d+\s*(of|Of)\s*\d+'),         # "Page 1of 3"
    re.compile(r'^APJ\s+ABDUL\s+KALAM', re.IGNORECASE), # University name
    re.compile(r'^Eighth\s+Semester', re.IGNORECASE),    # Semester line
    re.compile(r'^(Reg\s*No|Name)\s*:', re.IGNORECASE),  # Student fields
    re.compile(r'^\*+$'),                                 # "****" separator
    re.compile(r'^C\s*$'),                                # Stray letter (watermark artifact)
    re.compile(r'^A\s*$'),                                # Stray letter (watermark artifact)
    re.compile(r'^Pages:\s*\d+', re.IGNORECASE),         # "Pages: 3"
    re.compile(r'^Max\.\s*Marks:', re.IGNORECASE),       # Header fields
    re.compile(r'^Duration:', re.IGNORECASE),
    re.compile(r'^Course\s*(Code|Name):', re.IGNORECASE),
    re.compile(r'^Marks\s*$'),                            # Column header
    re.compile(r'^Answer\s+(all|any)', re.IGNORECASE),   # Instructions
]


def remove_noise(text: str) -> str:
    """Strip header/footer/metadata lines from extracted text."""
    clean_lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            clean_lines.append("")
            continue
        is_noise = any(p.match(stripped) for p in _NOISE_PATTERNS)
        if not is_noise:
            clean_lines.append(stripped)
    return "\n".join(clean_lines)


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 4: Structure detection & line reconstruction
# ═══════════════════════════════════════════════════════════════════════════

# Signals a NEW structural element starts on this line
_MARKS_PATTERN = re.compile(r'\(\d+\)\s*$')  # "(3)" "(7)" "(10)" at end of line

# Regex family for structure detection
_RE_PART_HDR   = re.compile(r'^PART\s*[AB]', re.IGNORECASE)
_RE_MODULE_HDR = re.compile(r'^Module\s*[IVX\d]+', re.IGNORECASE)
_RE_OR         = re.compile(r'^OR\s*$', re.IGNORECASE)
_RE_PART_B_Q   = re.compile(r'^\d{2}\s+[a-d]\)', re.IGNORECASE)  # "11 a)"
_RE_PART_A_NUM = re.compile(r'^([1-9]|10)\s*$')                   # standalone "1" "2" ... "10"
_RE_SUB_Q      = re.compile(r'^[a-d]\)\s+\S', re.IGNORECASE)      # standalone "b) Explain"

def _is_structure_break(line: str) -> bool:
    return (
        bool(_RE_PART_HDR.match(line))
        or bool(_RE_MODULE_HDR.match(line))
        or bool(_RE_OR.match(line))
        or bool(_RE_PART_B_Q.match(line))
        or bool(_RE_PART_A_NUM.match(line))
        or bool(_RE_SUB_Q.match(line))
    )


def merge_broken_lines(text: str) -> list[str]:
    """
    Merge OCR-broken multi-line questions into single logical lines.
    Key behaviours:
      - A standalone number line like "1" followed by "Define entropy..." → "1 Define entropy..."
      - "11 a) Explain..." is one unit; "b) Compare..." is a separate unit
      - Mark annotations "(3)" "(7)" stripped out
    """
    raw_lines = text.splitlines()
    merged = []
    buffer = ""
    _prev_was_part_a_num = False   # tracks if last flush was a bare number

    for raw_line in raw_lines:
        line = raw_line.strip()
        if not line:
            continue

        line_clean = _MARKS_PATTERN.sub("", line).strip()
        if not line_clean:
            continue

        is_break = _is_structure_break(line_clean)
        is_bare_num = bool(_RE_PART_A_NUM.match(line_clean))

        if is_break:
            if is_bare_num:
                # Don't flush yet — the question text comes on the NEXT line(s)
                if buffer:
                    merged.append(buffer.strip())
                buffer = line_clean   # start buffer with just the number
                _prev_was_part_a_num = True
            else:
                if buffer:
                    merged.append(buffer.strip())
                buffer = line_clean
                _prev_was_part_a_num = False
        else:
            if buffer:
                # If buffer is just a number, join as "<num> <text>"
                if _prev_was_part_a_num:
                    buffer = buffer + " " + line_clean
                    _prev_was_part_a_num = False
                else:
                    buffer += " " + line_clean
            else:
                buffer = line_clean
                _prev_was_part_a_num = False

    if buffer:
        merged.append(buffer.strip())

    return merged


# ═══════════════════════════════════════════════════════════════════════════
# LAYER 5: Question extraction
# ═══════════════════════════════════════════════════════════════════════════

_PART_A_HEADER = re.compile(r'^PART\s*A', re.IGNORECASE)
_PART_B_HEADER = re.compile(r'^PART\s*B', re.IGNORECASE)
_MODULE_HEADER = re.compile(r'^Module\s*([IVX\d]+)', re.IGNORECASE)
_OR_LINE       = re.compile(r'^OR\s*$', re.IGNORECASE)

# PART A: bare number followed by text: "1 Define entropy" or "10 Explain..."
_PART_A_Q = re.compile(r'^([1-9]|10)\s+(.+)', re.DOTALL)

# PART B main question: "11 a) Explain..." or "12 b) ..."
# The sub-question text may have inline " b) ..." merged — we split those out later
_PART_B_MAIN = re.compile(r'^(\d{2})\s+([a-d])\)\s*(.+)', re.DOTALL)

# Standalone sub-question: "b) Explain..."
_SUB_ONLY = re.compile(r'^([a-d])\)\s*(.+)', re.DOTALL)

# Inline sub-question split: " b) " or " c) " embedded inside text
_INLINE_SUB = re.compile(r'\s+([b-d])\)\s+')

_MODULE_MAP = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
}

def _roman_to_int(s: str) -> int:
    return _MODULE_MAP.get(s.upper(), 0)


def _get_part_a_module(q_num: int) -> int:
    """
    KTU fixed mapping:
    Q1,Q2 → Module 1 | Q3,Q4 → Module 2 | Q5,Q6 → Module 3
    Q7,Q8 → Module 4 | Q9,Q10 → Module 5
    """
    if   q_num <= 2:  return 1
    elif q_num <= 4:  return 2
    elif q_num <= 6:  return 3
    elif q_num <= 8:  return 4
    else:             return 5


def _split_inline_subs(first_marker: str, text: str) -> list[dict]:
    """
    Split merged sub-question text into separate dicts.
    
    Example input:  marker="a", text="Explain Huffman. b) Compare RLE and Arithmetic."
    Output: [
        {"marker": "a", "text": "Explain Huffman."},
        {"marker": "b", "text": "Compare RLE and Arithmetic."}
    ]
    
    If no inline " b) " delimiter found, returns single dict with full text.
    """
    # Try to find embedded " b) ", " c) " etc.
    parts = _INLINE_SUB.split(text)
    # _INLINE_SUB has one capturing group → split gives: [text_a, "b", text_b, "c", text_c, ...]
    
    if len(parts) == 1:
        # No inline sub-questions
        return [{"marker": first_marker, "text": text.strip()}]
    
    result = []
    # First part belongs to first_marker
    result.append({"marker": first_marker, "text": parts[0].strip()})
    
    # Remaining parts come in pairs: (marker, text)
    for i in range(1, len(parts), 2):
        if i + 1 < len(parts):
            result.append({
                "marker": parts[i],
                "text":   parts[i + 1].strip()
            })
    
    return result


def extract_questions(merged_lines: list[str], source_file: str = "") -> dict:
    """
    Parse merged lines into structured question objects.
    
    Returns:
    {
      "source": filename,
      "part_a": [{"q_num": 1, "text": "...", "module": 1},...],
      "part_b": [
        {
          "q_num": 11,
          "module": 1,
          "is_or_variant": False,
          "sub_questions": [
            {"marker": "a", "text": "..."},
            {"marker": "b", "text": "..."}
          ]
        },...
      ]
    }
    """
    result = {
        "source": source_file,
        "part_a": [],
        "part_b": [],
    }

    current_section = None   # "A" or "B"
    current_module  = 0
    current_main_q  = None   # current PART B main question dict
    is_after_or     = False   # marks the second-choice question in a module

    for line in merged_lines:
        # ── Section headers ─────────────────────────────────────────────
        if _PART_A_HEADER.match(line):
            current_section = "A"
            continue
        if _PART_B_HEADER.match(line):
            current_section = "B"
            continue

        # ── Module header ────────────────────────────────────────────────
        m = _MODULE_HEADER.match(line)
        if m:
            current_module = _roman_to_int(m.group(1))
            is_after_or = False
            current_main_q = None
            continue

        # ── OR separator ─────────────────────────────────────────────────
        if _OR_LINE.match(line):
            is_after_or = True
            current_main_q = None
            continue

        # ── PART A question ──────────────────────────────────────────────
        if current_section == "A":
            m = _PART_A_Q.match(line)
            if m:
                q_num = int(m.group(1))
                # Module assignment from question number (KTU fixed mapping)
                module = _get_part_a_module(q_num)
                result["part_a"].append({
                    "q_num": q_num,
                    "text":   m.group(2).strip(),
                    "module": module,
                })
            continue

        # ── PART B question ──────────────────────────────────────────────
        if current_section == "B":
            # Pattern: "11 a) Explain... b) Compare..."
            m = _PART_B_MAIN.match(line)
            if m:
                q_num  = int(m.group(1))
                marker = m.group(2)
                raw_text = m.group(3).strip()

                # New main question number → create new main question object
                if current_main_q is None or current_main_q["q_num"] != q_num:
                    current_main_q = {
                        "q_num":         q_num,
                        "module":        current_module,
                        "is_or_variant": is_after_or,
                        "sub_questions": [],
                    }
                    result["part_b"].append(current_main_q)

                # Split inline sub-questions: "text a b) text b"
                sub_parts = _split_inline_subs(marker, raw_text)
                current_main_q["sub_questions"].extend(sub_parts)
                continue

            # Standalone sub-question (continuation)
            m = _SUB_ONLY.match(line)
            if m and current_main_q:
                raw_text = m.group(2).strip()
                sub_parts = _split_inline_subs(m.group(1), raw_text)
                current_main_q["sub_questions"].extend(sub_parts)

    return result






# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════

def parse_pdf(pdf_path: str) -> dict:
    """
    Full pipeline: PDF → raw text → clean → merge lines → extract questions.
    
    Returns structured dict with part_a[], part_b[], source, mode, error.
    """
    raw_text, mode, error = extract_raw_text(pdf_path)

    cleaned   = fix_ocr_errors(raw_text)
    no_noise  = remove_noise(cleaned)
    merged    = merge_broken_lines(no_noise)
    questions = extract_questions(merged, source_file=os.path.basename(pdf_path))

    questions["mode"]  = mode
    questions["error"] = error

    return questions


def parse_multiple_pdfs(pdf_paths: list[str]) -> list[dict]:
    """Parse multiple PDFs and return a list of results."""
    return [parse_pdf(p) for p in pdf_paths]
