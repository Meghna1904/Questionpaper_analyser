"""Quick parser verification — runs against all 3 sample papers."""
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
    print(f"\n{'='*55}")
    print(f"FILE : {pdf_name}")
    print(f"MODE : {result['mode']}  |  ERROR: {result['error']}")
    print(f"PART A: {len(pa)} questions")
    for q in pa:
        print(f"  Q{q['q_num']} (M{q['module']}): {q['text'][:80]}")
    print(f"PART B: {len(pb)} main questions")
    for q in pb:
        subs = " + ".join(f"{s['marker']}){s['text'][:40]}" for s in q["sub_questions"])
        print(f"  Q{q['q_num']} (M{q['module']}) {'[OR]' if q['is_or_variant'] else '    '}: {subs[:100]}")
