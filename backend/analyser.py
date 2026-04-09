"""
analyser.py — Hybrid SBERT + Keyword Topic Matcher (multi-label)
=================================================================
Maps each question to one or more syllabus topics using:
  final_score = 0.7 × sbert_similarity + 0.3 × keyword_overlap

Returns multi-label assignments with confidence scores, so one question
can belong to multiple topics (e.g., "CFG and cyclomatic complexity").
"""

import re
import os
from collections import defaultdict
from typing import Optional

import numpy as np

# Detect environment and decide SBERT usage before importing heavy deps.
_USE_SBERT_ENV = os.getenv("USE_SBERT", "").strip().lower()
_RUNNING_ON_RENDER = bool(os.getenv("RENDER")) or bool(os.getenv("RENDER_EXTERNAL_URL"))

# Default to disabling SBERT on Render free tier to avoid OOM, unless explicitly enabled.
if _USE_SBERT_ENV:
    USE_SBERT = _USE_SBERT_ENV in {"1", "true", "yes", "y", "on"}
else:
    USE_SBERT = False if _RUNNING_ON_RENDER else True

# Optional SBERT import (can be heavy due to torch)
if USE_SBERT:
    try:
        from sentence_transformers import SentenceTransformer
        _SBERT_MODEL = None  # lazy-loaded
        HAS_SBERT = True
    except ImportError:
        HAS_SBERT = False
        _SBERT_MODEL = None
else:
    HAS_SBERT = False
    _SBERT_MODEL = None

from sklearn.metrics.pairwise import cosine_similarity


# ═══════════════════════════════════════════════════════════════════════════
# Model loading (singleton, lazy)
# ═══════════════════════════════════════════════════════════════════════════

def _get_model():
    global _SBERT_MODEL
    if _SBERT_MODEL is None and HAS_SBERT:
        print("[analyser] Loading SBERT model (first run only)...")
        _SBERT_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        print("[analyser] Model loaded.")
    return _SBERT_MODEL


# ═══════════════════════════════════════════════════════════════════════════
# Keyword overlap scorer (TF-IDF style bag-of-words)
# ═══════════════════════════════════════════════════════════════════════════

_STOP_WORDS = {
    "the", "a", "an", "and", "or", "of", "in", "to", "for", "with",
    "is", "are", "was", "be", "by", "on", "at", "from", "that", "this",
    "what", "how", "why", "which", "any", "all", "its", "their", "it",
    "explain", "describe", "define", "discuss", "compare", "state",
    "elaborate", "illustrate", "identify", "give", "list", "show",
    "find", "compute", "calculate", "write", "draw", "outline",
}


def _tokenize(text: str) -> set[str]:
    """Lowercase tokenize, drop stop words and short tokens."""
    tokens = re.findall(r'[a-z0-9]+', text.lower())
    return {t for t in tokens if t not in _STOP_WORDS and len(t) > 2}


def keyword_overlap_score(question: str, topic: str) -> float:
    """
    Jaccard-style overlap between question tokens and topic tokens.
    Returns [0, 1].
    """
    q_tokens = _tokenize(question)
    t_tokens = _tokenize(topic)
    if not q_tokens or not t_tokens:
        return 0.0
    intersection = q_tokens & t_tokens
    # Weighted: intersect / topic_tokens (recall-biased, so topic match matters more)
    return len(intersection) / len(t_tokens)


# ═══════════════════════════════════════════════════════════════════════════
# SBERT similarity scorer
# ═══════════════════════════════════════════════════════════════════════════

def sbert_similarity_batch(
    questions: list[str],
    topics: list[str],
    model,
) -> np.ndarray:
    """
    Compute cosine similarity matrix: shape (n_questions, n_topics).
    """
    q_embs = model.encode(questions, show_progress_bar=False, normalize_embeddings=True)
    t_embs = model.encode(topics,    show_progress_bar=False, normalize_embeddings=True)
    return cosine_similarity(q_embs, t_embs)  # (n_q, n_t)


# ═══════════════════════════════════════════════════════════════════════════
# Hybrid scorer
# ═══════════════════════════════════════════════════════════════════════════

SBERT_WEIGHT   = 0.7
KEYWORD_WEIGHT = 0.3
TOP_K_TOPICS   = 3    # max topics per question
MIN_CONFIDENCE = 0.25  # minimum score to assign a topic
\n

def score_questions_against_syllabus(
    questions: list[dict],   # list of {"text": ..., "q_num": ..., "module": ...}
    syllabus_flat: list[dict],  # [{"topic": ..., "module": ..., "module_title": ...}]
    use_sbert: bool = True,
) -> list[dict]:
    """
    For each question, assign up to TOP_K_TOPICS with confidence scores.

    Returns list of enriched question dicts:
    {
      ...original question fields...,
      "topics": [
        {"name": "Huffman Coding", "module": 2, "module_title": "...", "score": 0.87},
        {"name": "Prefix Codes",   "module": 2, "module_title": "...", "score": 0.61},
      ],
      "primary_module": 2,   # module of highest-scoring topic
    }
    """
    enriched = []
    
    # We load SBERT if requested
    model = _get_model() if (use_sbert and HAS_SBERT and USE_SBERT) else None

    for qi, q in enumerate(questions):
        # 1. Hard-map the module using parser
        target_module = q.get("module", 0)

        # 2. Extract ONLY topics for that target module
        # If parsing failed and module is 0, we'll fall back to searching all modules.
        # But if module is known (1-5), STRICTLY limit the search space to that module.
        if target_module > 0:
            local_topics = [t for t in syllabus_flat if t["module"] == target_module]
        else:
            local_topics = syllabus_flat
            
        if not local_topics:
            enriched.append({**q, "topics": [], "primary_module": target_module, "is_uncertain": True})
            continue

        local_texts = [t["topic"] for t in local_topics]

        # 3. Compute NLP similarity strictly against the local topics
        if model:
            sbert_scores = sbert_similarity_batch([q["text"]], local_texts, model)[0]
        else:
            sbert_scores = None

        topic_scores = []
        for ti, topic_info in enumerate(local_topics):
            kw_score = keyword_overlap_score(q["text"], topic_info["topic"])
            sb_score = float(sbert_scores[ti]) if sbert_scores is not None else kw_score
            
            hybrid = SBERT_WEIGHT * sb_score + KEYWORD_WEIGHT * kw_score
            topic_scores.append((hybrid, topic_info))

        # Sort descending, take top-K
        topic_scores.sort(key=lambda x: x[0], reverse=True)
        assigned = []
        
        # Check highest score for uncertainty flag
        max_score = topic_scores[0][0] if topic_scores else 0.0
        is_uncertain = max_score < 0.4
        
        for score, topic_info in topic_scores[:TOP_K_TOPICS]:
            if score >= MIN_CONFIDENCE:
                assigned.append({
                    "name":         topic_info["topic"],
                    "module":       topic_info["module"],
                    "module_title": topic_info["module_title"],
                    "score":        round(score, 4),
                })

        primary_module = assigned[0]["module"] if assigned else target_module

        enriched.append({
            **q,
            "topics":         assigned,
            "primary_module": primary_module,
            "is_uncertain":   is_uncertain
        })

    return enriched


# ═══════════════════════════════════════════════════════════════════════════
# Frequency aggregation
# ═══════════════════════════════════════════════════════════════════════════

def compute_topic_frequency(
    all_enriched_questions: list[dict],
    syllabus_flat: list[dict] = None
) -> dict:
    """
    Aggregate topic frequency across all questions from all papers.
    Each topic gets:
      - count: total weighted occurrences (sum of scores)
      - raw_count: number of questions mentioning this topic
      - module: which module this topic belongs to
      - questions: list of questions referencing this topic
    """
    freq: dict[str, dict] = defaultdict(lambda: {
        "count": 0.0,
        "raw_count": 0,
        "module": 0,
        "module_title": "",
        "questions": [],
    })

    if syllabus_flat:
        for st in syllabus_flat:
            key = st["topic"]
            freq[key]["module"] = st["module"]
            freq[key]["module_title"] = st.get("module_title", "")
            freq[key]["count"] = 0.0
            freq[key]["raw_count"] = 0
            freq[key]["questions"] = []

    for q in all_enriched_questions:
        for t in q.get("topics", []):
            key = t["name"]
            freq[key]["count"]        += t["score"]
            freq[key]["raw_count"]    += 1
            freq[key]["module"]        = t["module"]
            freq[key]["module_title"]  = t["module_title"]
            freq[key]["questions"].append({
                "text":   q["text"],
                "q_num":  q.get("q_num"),
                "source": q.get("source", ""),
                "score":  t["score"],
            })

    return dict(freq)


def get_ranked_topics(freq: dict, module: Optional[int] = None) -> list[dict]:
    """
    Return topics sorted by raw_count descending (most repeated first).
    Optionally filter by module.
    """
    items = [
        {"topic": k, **v}
        for k, v in freq.items()
        if (module is None or v["module"] == module)
    ]
    items.sort(key=lambda x: (x["raw_count"], x["count"]), reverse=True)
    return items


