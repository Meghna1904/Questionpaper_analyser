"""
app.py — Flask API Server
==========================
POST /api/analyse  — upload PDFs + syllabus → full analysis
GET  /api/status   — health check
"""

import os
import json
import os
import re
import tempfile
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS

try:
    from xhtml2pdf import pisa
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

from parser import parse_multiple_pdfs
from syllabus_parser import parse_syllabus, get_all_topics_flat, DEFAULT_SYLLABUS
from analyser import score_questions_against_syllabus, compute_topic_frequency, get_ranked_topics
from predictor import compute_prediction_scores, get_top_predictions_by_module

app = Flask(__name__)

# Allow frontend deployments and local dev to call the API.
ALLOWED_ORIGINS = {
    "https://questionpaper-analyser.vercel.app",
    "https://questionpaper-analyser-611nj57om-meghna1904s-projects.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
}

CORS(
    app,
    resources={r"/api/*": {"origins": list(ALLOWED_ORIGINS)}},
)

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response

@app.route("/api/<path:_path>", methods=["OPTIONS"])
def cors_preflight(_path):
    return ("", 204)

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
    freq_map = compute_topic_frequency(enriched, syllabus_flat)
    ranked_all = get_ranked_topics(freq_map)

    ranked_by_module = {}
    for mod_num in range(1, 6):
        ranked_by_module[mod_num] = get_ranked_topics(freq_map, module=mod_num)

    # ── 8. Predictions ───────────────────────────────────────────────────
    predictions = compute_prediction_scores(enriched, paper_dates=sorted(paper_names))
    predictions_by_module = get_top_predictions_by_module(predictions, top_n=5)

    # ── 9. Group questions by module (Structured Exam Format) ────────────
    module_structure = {str(i): {"partA": [], "partB": []} for i in range(1, 6)}
    part_b_map = {}

    for q in enriched:
        mod = q.get("primary_module", 0)
        if not (1 <= mod <= 5):
            continue
            
        if q.get("part") == "A":
            module_structure[str(mod)]["partA"].append({
                "number": q["q_num"],
                "text": q["text"],
                "topics": q.get("topics", []),
                "is_uncertain": q.get("is_uncertain", False),
                "source": q.get("source", "")
            })
        else: # Part B
            key = (mod, q.get("source", ""), q["q_num"], q.get("is_or_variant", False))
            if key not in part_b_map:
                part_b_map[key] = {
                    "number": q["q_num"],
                    "marks": 14,  # KTU essay mark weight
                    "is_or_variant": q.get("is_or_variant", False),
                    "source": q.get("source", ""),
                    "subQuestions": [],
                    "topics": [] 
                }
            
            part_b_map[key]["subQuestions"].append({
                "marker": q.get("sub", ""),
                "text": q["text"],
                "topics": q.get("topics", []),
                "is_uncertain": q.get("is_uncertain", False)
            })
            for t in q.get("topics", []):
                # Only add topic to parent level if not already present to avoid dupes
                if not any(existing_t["name"] == t["name"] for existing_t in part_b_map[key]["topics"]):
                    part_b_map[key]["topics"].append(t)
                    
    # Transfer mapped part B objects into the final lists
    for key, main_q in part_b_map.items():
        mod_str = str(key[0])
        module_structure[mod_str]["partB"].append(main_q)

    # Sort part A and part B questions by their number before returning
    for mod in module_structure.values():
        mod["partA"].sort(key=lambda x: x["number"])
        mod["partB"].sort(key=lambda x: (x["number"], x["is_or_variant"]))

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
        "ranked_topics_overall": ranked_all,
        "ranked_topics_by_module": {
            str(mod): ranked_by_module[mod]
            for mod in range(1, 6)
        },
        "module_structure": module_structure,
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


@app.route('/api/export-pdf', methods=['POST'])
def export_pdf():
    if not HAS_PDF:
        return jsonify({"error": "xhtml2pdf not installed on server"}), 500
        
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "No analysis data provided to export."}), 400
        # Render the HTML from the jinja template
        html_string = render_template('report.html', data=data)
        
        # Temp file for the generated PDF
        pdf_path = os.path.join(tempfile.gettempdir(), "QP_Analysis_Report.pdf")
        
        with open(pdf_path, "w+b") as result_file:
            pisa_status = pisa.CreatePDF(html_string, dest=result_file)
            
        if pisa_status.err:
            return jsonify({"error": "PDF compilation failed details unknown"}), 500
            
        return send_file(pdf_path, as_attachment=True, download_name="QP_Analysis_Report.pdf", mimetype='application/pdf')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Ensure uploads dir exists
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)

    app.run(host='0.0.0.0', port=5000, debug=True)
