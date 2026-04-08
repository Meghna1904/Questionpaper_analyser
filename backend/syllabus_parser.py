"""
syllabus_parser.py — Syllabus → Module/Topic structured map
=============================================================
Parses a syllabus (text or image) into 5 modules with topic keywords.
"""

import re
import os
from typing import Optional

try:
    import pytesseract
    from PIL import Image
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    HAS_OCR = os.path.exists(pytesseract.pytesseract.tesseract_cmd)
except ImportError:
    pytesseract = None
    Image = None
    HAS_OCR = False


# ═══════════════════════════════════════════════════════════════════════════
# Default syllabus (hardcoded for CST446 fallback)
# ═══════════════════════════════════════════════════════════════════════════

DEFAULT_SYLLABUS = {
    1: {
        "title": "Modelling and Types of Compression",
        "topics": [
            "Introduction to Compression Techniques",
            "Lossy compression",
            "Lossless compression",
            "Measures of Performance",
            "Modeling and coding",
            "Mathematical modelling",
            "Physical models",
            "Probability models",
            "Entropy",
            "Self information",
            "Data compression overview",
        ]
    },
    2: {
        "title": "Basic Compression Methods",
        "topics": [
            "Run length encoding",
            "RLE",
            "RLE Text compression",
            "Statistical Methods",
            "Prefix Codes",
            "Binary Huffman coding",
            "Non-binary Huffman Algorithms",
            "Arithmetic Coding",
            "Variable length coding",
            "Huffman tree",
            "Average code length",
        ]
    },
    3: {
        "title": "Text and Image Compression",
        "topics": [
            "Dictionary based Coding",
            "LZ77",
            "LZ78",
            "LZW compression",
            "JPEG image Compression",
            "Image standards",
            "Baseline JPEG",
            "JPEG-LS",
            "Discrete Cosine Transform",
            "DCT",
            "Image compression modes",
        ]
    },
    4: {
        "title": "Video Compression",
        "topics": [
            "Video Compression",
            "Analog video",
            "Digital Video",
            "Motion Compensation",
            "Motion vectors",
            "MPEG standards",
            "MPEG 1",
            "MPEG 4",
            "MPEG-1 video syntax",
            "Frame types I P B frames",
            "Progressive scanning",
            "Interlaced scanning",
            "YUV colour model",
            "YIQ colour model",
            "CRT monitor",
            "Video layers",
        ]
    },
    5: {
        "title": "Audio Compression",
        "topics": [
            "Audio Compression",
            "Digital Audio",
            "Basic Audio Compression Techniques",
            "MPEG Audio Compression",
            "Layer 1 coding",
            "Layer 2 coding",
            "Layer 3 coding",
            "MP3",
            "Psychoacoustic model",
            "Hearing Threshold",
            "Frequency Masking",
            "Temporal Masking",
            "Critical Bands",
            "Sound pressure level",
            "Companding",
            "Spectral masking",
        ]
    }
}


# ═══════════════════════════════════════════════════════════════════════════
# Text-based syllabus parser
# ═══════════════════════════════════════════════════════════════════════════

_MODULE_RE = re.compile(
    r'^Module\s*[-–:]?\s*(\d+|[IVX]+)(.*)',
    re.IGNORECASE
)

_ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}


def _roman_to_int(s: str) -> int:
    s = s.strip().upper()
    return _ROMAN.get(s, int(s) if s.isdigit() else 0)


def _extract_topics_from_text(text: str) -> list[str]:
    """Extract comma/semicolon/newline separated topic keywords from a block of text."""
    # Remove parenthetical notes but we must be careful not to remove too much.
    text = re.sub(r'\([^)]*\)', '', text)
    # Split on comma, semicolon, dash after word, period, or newline
    raw = re.split(r'[,;\n]|\s-\s', text)
    topics = []
    for part in raw:
        t = part.strip().strip('.')
        if len(t) > 2:  # skip single chars and noise
            topics.append(t)
    return topics


def parse_syllabus_text(text: str) -> dict:
    """
    Parse free-form syllabus text into module→topics mapping.
    """
    modules = {}
    lines = text.splitlines()
    current_module = None
    current_content = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        m = _MODULE_RE.search(line)
        if m:
            # Save previous module
            if current_module is not None:
                content_text = " ".join(current_content)
                modules[current_module]["topics"] = _extract_topics_from_text(content_text)

            num = _roman_to_int(m.group(1))
            # Extract title if present inside parentheses or after a dash
            title_raw = m.group(2).strip()
            title = re.sub(r'^[()\-:\s]+|[()]+$', '', title_raw).strip()
            
            if not title:
                title = f"Module {num}"

            current_module = num
            modules[num] = {"title": title, "topics": []}
            current_content = []
        elif current_module is not None:
            current_content.append(line)
        elif current_module is None:
            # If there's text before "Module 1", maybe it's just a flat list of topics.
            # We can tentatively assign it to Module 1 if no module is defined yet.
            if not modules:
                current_module = 1
                modules[1] = {"title": "General", "topics": []}
            current_content.append(line)


    # Save last module
    if current_module is not None and current_content:
        content_text = " ".join(current_content)
        modules[current_module]["topics"] = _extract_topics_from_text(content_text)

    # If the user pasted text but no "Module X" tags were found, we just have everything in Module 1.
    return modules


def parse_syllabus_image(image_path: str) -> tuple[dict, Optional[str]]:
    """OCR an image and parse the resulting text as syllabus."""
    if not HAS_OCR:
        return {}, "Tesseract OCR is not installed. Please paste the syllabus text instead."
    try:
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img, lang="eng")
        return parse_syllabus_text(text), None
    except Exception as e:
        return {}, f"Failed to read image: {str(e)}"


def parse_syllabus(text: Optional[str] = None, image_path: Optional[str] = None) -> tuple[dict, Optional[str]]:
    """
    Main entry point.
    - If text provided → parse text
    - If image_path provided → OCR then parse
    - If neither → return default
    Returns: (syllabus_dict, error_message)
    """
    if text and text.strip():
        # Do NOT fallback to Data Compression if they supplied their own syllabus!
        return parse_syllabus_text(text), None

    if image_path and os.path.exists(image_path):
        return parse_syllabus_image(image_path)

    return DEFAULT_SYLLABUS, None


def get_all_topics_flat(syllabus: dict) -> list[dict]:
    """
    Return a flat list of all topics with their module number.
    [{"topic": "...", "module": 1, "module_title": "..."}, ...]
    """
    flat = []
    for mod_num, mod_data in syllabus.items():
        for topic in mod_data.get("topics", []):
            flat.append({
                "topic": topic,
                "module": mod_num,
                "module_title": mod_data.get("title", f"Module {mod_num}"),
            })
    return flat
