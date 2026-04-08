import sys
sys.path.insert(0, r"d:\QP extractor\backend")
from parser import parse_pdf
import os, json

sample_dir = r"d:\QP extractor\SAmple question paper"
pdfs = sorted([f for f in os.listdir(sample_dir) if f.endswith(".pdf")])

summary = {}
for pdf_name in pdfs:
    result = parse_pdf(os.path.join(sample_dir, pdf_name))
    pa = result["part_a"]
    pb = result["part_b"]
    summary[pdf_name] = {
        "mode": result["mode"],
        "part_a_count": len(pa),
        "part_b_count": len(pb),
        "part_a": pa,
        "part_b": pb,
    }

out = r"d:\QP extractor\parser_summary.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, ensure_ascii=False)

print("Written to", out)
for name, data in summary.items():
    print(f"{name}: mode={data['mode']} partA={data['part_a_count']} partB={data['part_b_count']}")
