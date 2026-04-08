import sys
sys.path.insert(0, r"d:\QP extractor\backend")
from parser import parse_pdf
import os

sample_dir = r"d:\QP extractor\SAmple question paper"
pdfs = sorted([f for f in os.listdir(sample_dir) if f.endswith(".pdf")])

for pdf_name in pdfs:
    result = parse_pdf(os.path.join(sample_dir, pdf_name))
    pa = result["part_a"]
    pb = result["part_b"]
    print("FILE: %s  MODE:%s  PARTA:%d  PARTB:%d" % (pdf_name, result["mode"], len(pa), len(pb)))
    for q in pa:
        print("  A-Q%d(M%d): %s" % (q["q_num"], q["module"], repr(q["text"][:60])))
    for q in pb:
        subs = len(q["sub_questions"])
        first = q["sub_questions"][0]["text"][:50] if subs else ""
        tag = "[OR]" if q["is_or_variant"] else "    "
        print("  B-Q%d(M%d)%s subs=%d: %s" % (q["q_num"], q["module"], tag, subs, repr(first)))
    print()
