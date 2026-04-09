/**
 * analyseEngine.js — Orchestrator (replaces Flask /api/analyse)
 * ==============================================================
 * Runs the full pipeline client-side:
 *   PDF files → text → parse → analyse → predict → result object
 *
 * The returned shape is IDENTICAL to the backend API response so all
 * existing UI components (ResultsPage, QuestionList, etc.) work unchanged.
 *
 * PDFs are processed SEQUENTIALLY (not Promise.all) to avoid browser OOM.
 */

import { extractTextFromPDF }                              from './pdfExtractor';
import { parsePDFText }                                    from './parser';
import { parseSyllabus, flattenSyllabus }                  from './syllabusParser';
import { scoreQuestionsAgainstSyllabus, computeTopicFrequency, getRankedTopics } from './analyser';
import { computePredictionScores, getTopPredictionsByModule } from './predictor';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build the module_structure object consumed by QuestionList */
function buildModuleStructure(allParsed) {
  // { modNum: { partA: [...], partB: [...] } }
  const structure = {};

  for (let m = 1; m <= 5; m++) {
    structure[String(m)] = { partA: [], partB: [] };
  }

  for (const parsed of allParsed) {
    // Part A
    for (const q of parsed.part_a) {
      const key = String(q.module);
      if (!structure[key]) structure[key] = { partA: [], partB: [] };
      structure[key].partA.push({
        number:   q.q_num,
        text:     q.text,
        module:   q.module,
        topics:   q.topics   || [],
        source:   q.source   || '',
      });
    }
    // Part B
    for (const q of parsed.part_b) {
      const key = String(q.module);
      if (!structure[key]) structure[key] = { partA: [], partB: [] };
      structure[key].partB.push({
        number:        q.q_num,
        module:        q.module,
        is_or_variant: q.is_or_variant,
        subQuestions:  q.sub_questions || [],
        source:        q.source        || '',
      });
    }
  }

  return structure;
}


/** Flatten part_a + part_b questions into a single list for scoring */
function flattenQuestions(parsed) {
  const out = [];

  for (const q of parsed.part_a) {
    out.push({ q_num: q.q_num, text: q.text, module: q.module, source: q.source || '', part: 'A' });
  }

  for (const mainQ of parsed.part_b) {
    for (const sub of (mainQ.sub_questions || [])) {
      out.push({
        q_num:  mainQ.q_num,
        text:   sub.text,
        module: mainQ.module,
        source: mainQ.source || '',
        part:   'B',
        marker: sub.marker,
      });
    }
    // Also add the combined text for matching (improves recall)
    const combined = (mainQ.sub_questions || []).map(s => s.text).join(' ');
    if (combined.trim()) {
      out.push({
        q_num:  mainQ.q_num,
        text:   combined,
        module: mainQ.module,
        source: mainQ.source || '',
        part:   'B_combined',
      });
    }
  }

  return out;
}


/**
 * After enrichment, stitch topic assignments back onto the module_structure
 * (so QuestionList can show topic chips on each question row).
 */
function stitchTopicsIntoStructure(moduleStructure, enrichedFlat) {
  // Build lookup: { q_num+source → topics[] } for Part A
  const partALookup = {};
  for (const eq of enrichedFlat.filter(q => q.part === 'A')) {
    const key = `${eq.q_num}__${eq.source}`;
    partALookup[key] = eq.topics || [];
  }

  // For Part B, merge topics from all sub-questions + combined entry for a main Q
  const partBLookup = {};
  for (const eq of enrichedFlat.filter(q => q.part === 'B' || q.part === 'B_combined')) {
    const key = `${eq.q_num}__${eq.source}`;
    if (!partBLookup[key]) partBLookup[key] = [];
    partBLookup[key].push(...(eq.topics || []));
  }

  for (const [, data] of Object.entries(moduleStructure)) {
    for (const q of data.partA) {
      q.topics = partALookup[`${q.number}__${q.source}`] || [];
    }
    for (const q of data.partB) {
      const topics = partBLookup[`${q.number}__${q.source}`] || [];
      // Deduplicate by name
      const seen = new Set();
      q.topics = topics.filter(t => {
        if (seen.has(t.name)) return false;
        seen.add(t.name);
        return true;
      });

      // Stitch sub-question level topics too (Part B sub marker match)
      for (const sub of (q.subQuestions || [])) {
        const subEnriched = enrichedFlat.find(
          e => e.q_num === q.number && e.source === q.source &&
               e.part === 'B' && e.marker === sub.marker
        );
        sub.topics = subEnriched?.topics || [];
      }
    }
  }
}


/**
 * Build questions_by_module in the shape expected by ResultsPage.
 * questions_by_module[modNum] = flat array used for counting; the real
 * display is via module_structure.
 */
function buildQuestionsByModule(enrichedFlat) {
  const out = {};
  for (let m = 1; m <= 5; m++) out[String(m)] = [];

  for (const q of enrichedFlat) {
    const key = String(q.module);
    if (out[key]) out[key].push(q);
  }
  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {File[]}   files          PDF File objects from the dropzone
 * @param {string}   syllabusText   Raw text pasted by user
 * @param {Function} onProgress     Callback(message: string) for UI step updates
 * @returns {Promise<Object>}       Result object matching ResultsPage props
 */
export async function analyseFiles(files, syllabusText, onProgress = () => {}) {
  // ── 1. Parse syllabus ──────────────────────────────────────────────────
  onProgress('Parsing syllabus…');
  const syllabus     = parseSyllabus(syllabusText);
  const syllabusFlat = flattenSyllabus(syllabus);

  // ── 2. Extract & parse PDFs (SEQUENTIAL to avoid browser OOM) ─────────
  const allParsed    = [];
  const parseInfo    = [];
  const paperNames   = [];
  let   allFlatQ     = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(`Parsing PDF ${i + 1} of ${files.length} — ${file.name}…`);

    const { text, error } = await extractTextFromPDF(file);

    onProgress(`Extracting questions from ${file.name}…`);
    const parsed = parsePDFText(text, file.name, error);

    allParsed.push(parsed);
    parseInfo.push({ file: file.name, mode: 'digital', error: error || null });
    paperNames.push(file.name);

    const flat = flattenQuestions(parsed);
    allFlatQ   = allFlatQ.concat(flat);
  }

  // ── 3. Score questions against syllabus ───────────────────────────────
  onProgress('Matching topics to syllabus…');
  const enrichedFlat = syllabusFlat.length > 0
    ? scoreQuestionsAgainstSyllabus(allFlatQ, syllabusFlat)
    : allFlatQ.map(q => ({ ...q, topics: [], primary_module: q.module, is_uncertain: true }));

  // ── 4. Build module structure and stitch topics ───────────────────────
  onProgress('Building module breakdown…');
  const moduleStructure = buildModuleStructure(allParsed);
  stitchTopicsIntoStructure(moduleStructure, enrichedFlat);

  // ── 5. Frequency analysis ─────────────────────────────────────────────
  onProgress('Computing topic frequencies…');
  const freq = computeTopicFrequency(
    enrichedFlat.filter(q => q.part !== 'B_combined'), // avoid double-counting
    syllabusFlat
  );

  const rankedTopicsOverall = getRankedTopics(freq);
  const rankedTopicsByModule = {};
  for (let m = 1; m <= 5; m++) {
    rankedTopicsByModule[String(m)] = getRankedTopics(freq, m);
  }

  // ── 6. Predictions ────────────────────────────────────────────────────
  onProgress('Generating predictions…');
  const predFlat           = computePredictionScores(
    enrichedFlat.filter(q => q.part !== 'B_combined'),
    paperNames
  );
  const predsByModule      = getTopPredictionsByModule(predFlat, 5);
  const topPredictOverall  = predFlat.slice(0, 10);

  // ── 7. Totals ─────────────────────────────────────────────────────────
  const totalQuestions = allParsed.reduce(
    (sum, p) => sum + p.part_a.length + p.part_b.length,
    0
  );

  // ── 8. Assemble final result (identical shape to backend API) ─────────
  return {
    papers_analysed:          paperNames,
    total_questions:          totalQuestions,
    ranked_topics_overall:    rankedTopicsOverall,
    ranked_topics_by_module:  rankedTopicsByModule,
    questions_by_module:      buildQuestionsByModule(enrichedFlat),
    predictions_by_module:    predsByModule,
    top_predictions_overall:  topPredictOverall,
    parse_info:               parseInfo,
    syllabus,
    module_structure:         moduleStructure,
  };
}
