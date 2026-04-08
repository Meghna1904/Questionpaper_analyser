"""
predictor.py — Prediction Engine
==================================
Scores each topic using:
  score = (frequency * 0.6) + (recency_weight * 0.3) + (consistency * 0.1)

Where:
  frequency   = total raw count across all papers
  recency     = 1.0 if appeared in latest paper, 0.5 if one back, 0.0 if older
  consistency = fraction of papers where the topic appears
"""

from collections import defaultdict


def compute_prediction_scores(
    all_enriched_questions: list[dict],
    paper_dates: list[str],   # ordered list of paper names/dates, oldest first
) -> list[dict]:
    """
    Returns list of topic predictions sorted by score (highest first).

    Each item:
    {
      "topic": str,
      "module": int,
      "module_title": str,
      "frequency": int,        # total raw count
      "recency_weight": float, # 0..1
      "consistency": float,    # 0..1
      "prediction_score": float,
      "confidence_pct": int,   # 0..100 for UI display
      "appeared_in": [str],    # which papers had this topic
    }
    """
    n_papers = max(len(paper_dates), 1)

    # Group questions by paper source
    by_paper: dict[str, list] = defaultdict(list)
    for q in all_enriched_questions:
        by_paper[q.get("source", "unknown")].append(q)

    # Build per-topic stats
    topic_stats: dict[str, dict] = defaultdict(lambda: {
        "module": 0,
        "module_title": "",
        "raw_count": 0,
        "appeared_in": set(),
    })

    for q in all_enriched_questions:
        source = q.get("source", "unknown")
        for t in q.get("topics", []):
            key = t["name"]
            topic_stats[key]["module"]       = t["module"]
            topic_stats[key]["module_title"] = t["module_title"]
            topic_stats[key]["raw_count"]   += 1
            topic_stats[key]["appeared_in"].add(source)

    # Build ordered paper list from available sources
    available_papers = sorted(by_paper.keys())
    if paper_dates:
        ordered = paper_dates
    else:
        ordered = available_papers

    predictions = []
    max_count = max((s["raw_count"] for s in topic_stats.values()), default=1)

    for topic, stats in topic_stats.items():
        freq_norm = stats["raw_count"] / max(max_count, 1)  # 0..1

        # Recency: check how recent the topic's last appearance is
        appeared = stats["appeared_in"]
        recency = 0.0
        for i, paper in enumerate(reversed(ordered)):
            if paper in appeared:
                # Exponential decay: most recent = 1.0, one back = 0.6, two back = 0.36...
                recency = 0.6 ** i
                break

        # Consistency: fraction of papers where topic appeared
        consistency = len(appeared) / n_papers

        score = (freq_norm * 0.6) + (recency * 0.3) + (consistency * 0.1)

        # Confidence scaling: cap at ~85% for realistic bounds unless the dataset is very large
        base_conf = int(score * 100)
        confidence_cap = 85 if n_papers < 5 else 95
        confidence_pct = min(base_conf, confidence_cap)

        predictions.append({
            "topic":            topic,
            "module":           stats["module"],
            "module_title":     stats["module_title"],
            "frequency":        stats["raw_count"],
            "recency_weight":   round(recency, 3),
            "consistency":      round(consistency, 3),
            "prediction_score": round(score, 4),
            "confidence_pct":   confidence_pct,
            "appeared_in":      list(appeared),
        })

    predictions.sort(key=lambda x: x["prediction_score"], reverse=True)
    return predictions


def get_top_predictions_by_module(
    predictions: list[dict],
    top_n: int = 5,
) -> dict[int, list[dict]]:
    """Group predictions by module, return top_n per module."""
    by_module: dict[int, list] = defaultdict(list)
    for p in predictions:
        by_module[p["module"]].append(p)

    return {
        mod: sorted(items, key=lambda x: x["prediction_score"], reverse=True)[:top_n]
        for mod, items in by_module.items()
    }
