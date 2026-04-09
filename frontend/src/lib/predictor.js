/**
 * predictor.js — JS port of backend/predictor.py
 * =================================================
 * Scores each topic using:
 *   prediction_score = freq_norm × 0.6 + recency × 0.3 + consistency × 0.1
 *
 * Where:
 *   freq_norm   = raw_count / max_raw_count  (0–1)
 *   recency     = exponential decay: most recent paper = 1.0, one back = 0.6, etc.
 *   consistency = fraction of papers where this topic appeared
 *
 * Confidence cap: 85% for < 5 papers, 95% for ≥ 5 papers (realistic bounds).
 */

/**
 * @param {Array}    allEnrichedQuestions  Output of scoreQuestionsAgainstSyllabus
 * @param {string[]} paperNames            Ordered list of paper filenames (oldest first)
 * @returns {Array}  Sorted predictions list
 */
export function computePredictionScores(allEnrichedQuestions, paperNames = []) {
  const nPapers = Math.max(paperNames.length, 1);

  // Build per-topic stats
  const topicStats = {};

  for (const q of allEnrichedQuestions) {
    const source = q.source || 'unknown';
    for (const t of (q.topics || [])) {
      if (!topicStats[t.name]) {
        topicStats[t.name] = {
          module:       t.module,
          module_title: t.module_title,
          raw_count:    0,
          appeared_in:  new Set(),
        };
      }
      topicStats[t.name].module       = t.module;
      topicStats[t.name].module_title = t.module_title;
      topicStats[t.name].raw_count   += 1;
      topicStats[t.name].appeared_in.add(source);
    }
  }

  const maxCount = Math.max(...Object.values(topicStats).map(s => s.raw_count), 1);

  const predictions = [];

  for (const [topic, stats] of Object.entries(topicStats)) {
    const freqNorm = stats.raw_count / maxCount;

    // Recency — scan from most recent paper backwards
    let recency = 0;
    const orderedReverse = [...paperNames].reverse();
    for (let i = 0; i < orderedReverse.length; i++) {
      if (stats.appeared_in.has(orderedReverse[i])) {
        recency = Math.pow(0.6, i); // decay: 1.0, 0.6, 0.36, ...
        break;
      }
    }

    const consistency = stats.appeared_in.size / nPapers;
    const score       = freqNorm * 0.6 + recency * 0.3 + consistency * 0.1;

    const confidenceCap = nPapers < 5 ? 85 : 95;
    const confidencePct = Math.min(Math.round(score * 100), confidenceCap);

    predictions.push({
      topic,
      module:           stats.module,
      module_title:     stats.module_title,
      frequency:        stats.raw_count,
      recency_weight:   Math.round(recency * 1000) / 1000,
      consistency:      Math.round(consistency * 1000) / 1000,
      prediction_score: Math.round(score * 10000) / 10000,
      confidence_pct:   confidencePct,
      appeared_in:      [...stats.appeared_in],
    });
  }

  predictions.sort((a, b) => b.prediction_score - a.prediction_score);
  return predictions;
}


/**
 * Group predictions by module, return top-N per module.
 * @param {Array}  predictions  Output of computePredictionScores
 * @param {number} topN
 * @returns {Object}  { moduleNumber: [prediction, ...] }
 */
export function getTopPredictionsByModule(predictions, topN = 5) {
  const byModule = {};

  for (const p of predictions) {
    if (!byModule[p.module]) byModule[p.module] = [];
    byModule[p.module].push(p);
  }

  const result = {};
  for (const [mod, preds] of Object.entries(byModule)) {
    result[mod] = preds
      .sort((a, b) => b.prediction_score - a.prediction_score)
      .slice(0, topN);
  }
  return result;
}
