"""
Minimal PDF structure inspector - writes per-PDF reports to separate files
"""
import fitz
import re
import os

sample_dir = r"d:\QP extractor\SAmple question paper"
out_dir = r"d:\QP extractor"

pdfs = sorted([f for f in os.listdir(sample_dir) if f.endswith(".pdf")])

for pdf_name in pdfs:
    pdf_path = os.path.join(sample_dir, pdf_name)
    doc = fitz.open(pdf_path)
    
    pages_text = []
    for i, page in enumerate(doc):
        t = page.get_text()
        pages_text.append(f"=== PAGE {i+1} ===\n{t}")
    doc.close()
    
    full = "\n".join(pages_text)
    
    # count meaningful chars
    chars = len(re.sub(r'\s+', '', full))
    pages = len(pages_text)
    
    safe_name = pdf_name.replace(" ", "_").replace(".pdf", "")
    out_file = os.path.join(out_dir, f"raw_{safe_name}.txt")
    
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(f"FILE: {pdf_name}\n")
        f.write(f"PAGES: {pages}, TOTAL CHARS (no whitespace): {chars}, AVG/PAGE: {chars//pages}\n")
        f.write(f"IS_DIGITAL: {chars//pages >= 150}\n\n")
        f.write(full)
    
    print(f"Written: {out_file}  |  pages={pages}, chars/page={chars//pages}, digital={chars//pages >= 150}")

print("DONE")
