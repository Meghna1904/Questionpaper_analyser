"""
app.py — Flask API Server
==========================
POST /api/analyse  — upload PDFs + syllabus → full analysis
GET  /api/status   — health check
"""

import os
import json
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS

from parser import parse_multiple_pdfs
from syllabus_parser import parse_syllabus, get_all_topics_flat, DEFAULT_SYLLABUS
from analyser import score_questions_against_syllabus, compute_topic_frequency, get_ranked_topics
from predictor import compute_prediction_scores, get_top_predictions_by_module

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXT = {"pdf", "png", "jpg", "jpeg"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({"status": "ok", "message": "QP Analyser backend is running"})


@app.route("/api/analyse", methods=["POST"])
def analyse():
    """
    Expects multipart/form-data with:
      - files[]: one or more PDF files
      - syllabus_text: (optional) plain text syllabus
      - syllabus_image: (optional) image file of syllabus
    """
    # ── 1. Validate files ────────────────────────────────────────────────
    if "files[]" not in request.files:
        return jsonify({"error": "No PDF files uploaded. Use key 'files[]'."}), 400

    uploaded_files = request.files.getlist("files[]")
    pdf_files = [f for f in uploaded_files if f and allowed_file(f.filename)]
    if not pdf_files:
        return jsonify({"error": "No valid PDF files found."}), 400

    # ── 2. Save PDFs to temp dir ─────────────────────────────────────────
    saved_paths = []
    paper_names = []
    for f in pdf_files:
        path = os.path.join(UPLOAD_FOLDER, f.filename)
        f.save(path)
        saved_paths.append(path)
        paper_names.append(f.filename)

    # ── 3. Parse syllabus ────────────────────────────────────────────────
    syllabus_text = request.form.get("syllabus_text", "")

    syllabus, syllabus_error = parse_syllabus(
        text=syllabus_text if syllabus_text else None
    )
    
    if syllabus_error:
        return jsonify({"error": f"Syllabus Error: {syllabus_error}"}), 400
        
    syllabus_flat = get_all_topics_flat(syllabus)

    # ── 4. Parse all PDFs ────────────────────────────────────────────────
    parsed_papers = parse_multiple_pdfs(saved_paths)
    for paper, name in zip(parsed_papers, paper_names):
        # Attach source name to every question
        for q in paper.get("part_a", []):
            q["source"] = name
            q["part"] = "A"
        for q in paper.get("part_b", []):
            q["source"] = name
            q["part"] = "B"
            for sub in q.get("sub_questions", []):
                sub["source"] = name

    # ── 5. Flatten all questions ─────────────────────────────────────────
    all_questions = []

    for paper in parsed_papers:
        # Part A questions
        all_questions.extend(paper.get("part_a", []))

        # Part B: flatten sub-questions as individual analysable units
        for main_q in paper.get("part_b", []):
            for sub in main_q.get("sub_questions", []):
                all_questions.append({
                    "q_num":  main_q["q_num"],
                    "sub":    sub["marker"],
                    "text":   sub["text"],
                    "module": main_q["module"],
                    "source": main_q.get("source", ""),
                    "part":   "B",
                    "is_or_variant": main_q["is_or_variant"],
                })

    # ── 6. NLP topic matching ────────────────────────────────────────────
    enriched = score_questions_against_syllabus(all_questions, syllabus_flat)

    # ── 7. Frequency analysis ────────────────────────────────────────────
    freq_map = compute_topic_frequency(enriched)
    ranked_all = get_ranked_topics(freq_map)

    ranked_by_module = {}
    for mod_num in range(1, 6):
        ranked_by_module[mod_num] = get_ranked_topics(freq_map, module=mod_num)

    # ── 8. Predictions ───────────────────────────────────────────────────
    predictions = compute_prediction_scores(enriched, paper_dates=sorted(paper_names))
    predictions_by_module = get_top_predictions_by_module(predictions, top_n=5)

    # ── 9. Group questions by module ─────────────────────────────────────
    questions_by_module = {i: [] for i in range(1, 6)}
    for q in enriched:
        mod = q.get("primary_module", 0)
        if 1 <= mod <= 5:
            questions_by_module[mod].append(q)

    # ── 10. Build response ───────────────────────────────────────────────
    response = {
        "papers_analysed": paper_names,
        "total_questions": len(all_questions),
        "syllabus": {
            mod: {
                "title": data["title"],
                "topic_count": len(data["topics"]),
            }
            for mod, data in syllabus.items()
        },
        "ranked_topics_overall": ranked_all[:30],
        "ranked_topics_by_module": {
            str(mod): ranked_by_module[mod]
            for mod in range(1, 6)
        },
        "questions_by_module": {
            str(mod): questions_by_module[mod]
            for mod in range(1, 6)
        },
        "predictions_by_module": {
            str(mod): preds
            for mod, preds in predictions_by_module.items()
        },
        "top_predictions_overall": predictions[:10],
        "parse_info": [
            {
                "file": p.get("source", ""),
                "mode": p.get("mode", ""),
                "part_a_count": len(p.get("part_a", [])),
                "part_b_count": len(p.get("part_b", [])),
                "error": p.get("error"),
            }
            for p in parsed_papers
        ],
    }

    return jsonify(response)


if __name__ == "__main__":
    print("QP Analyser API starting on http://localhost:5000")
    app.run(debug=True, port=5000)
