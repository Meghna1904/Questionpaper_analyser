/**
 * analyser.js — JS port of backend/analyser.py
 * ===============================================
 * Replaces SBERT with Jaccard keyword overlap + synonym expansion.
 *
 * Scoring:
 *   score = keywordOverlapScore(question, topic) ∈ [0, 1]
 *
 * Topic assignment per question:
 *   - Strict module isolation (only match topics from the question's own module)
 *   - Keep top-3 matches where score ≥ MIN_CONFIDENCE (0.40)
 *   - Label each match: Strong (≥0.70), Medium (0.40–0.69)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Stop words
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','of','in','to','for','with','is','are','was','be',
  'by','on','at','from','that','this','what','how','why','which','any','all',
  'its','their','it','explain','describe','define','discuss','compare','state',
  'elaborate','illustrate','identify','give','list','show','find','compute',
  'calculate','write','draw','outline','using','use','brief','short','note',
  'difference','between','example','examples','write','discuss',
]);


// ─────────────────────────────────────────────────────────────────────────────
// Synonym dictionary  (canonical term → array of alternate forms)
// ─────────────────────────────────────────────────────────────────────────────

const SYNONYMS = {
  'cyclomatic complexity':    ['mccabe complexity', 'cyclomatic number', 'mccabe metric'],
  'distributed system':       ['distributed computing', 'distributed environment', 'distributed processing'],
  'huffman coding':           ['huffman tree', 'huffman encoding', 'huffman algorithm'],
  'finite automata':          ['finite state machine', 'fsa', 'dfa', 'nfa', 'deterministic automata'],
  'context free grammar':     ['cfg', 'pushdown automata', 'pda', 'context-free language'],
  'time complexity':          ['big o', 'asymptotic analysis', 'asymptotic complexity', 'order of complexity'],
  'space complexity':         ['memory complexity', 'auxiliary space'],
  'dynamic programming':      ['dp', 'memoization', 'tabulation'],
  'minimum spanning tree':    ['mst', 'prims algorithm', 'kruskals algorithm', 'spanning tree'],
  'shortest path':            ['dijkstra', 'bellman ford', 'single source shortest path'],
  'sorting':                  ['merge sort', 'quick sort', 'heap sort', 'bubble sort', 'insertion sort'],
  'binary search tree':       ['bst', 'binary tree', 'search tree'],
  'regular expression':       ['regex', 'regular language', 'regular grammar'],
  'turing machine':           ['tm', 'universal turing machine'],
  'mutual exclusion':         ['mutex', 'critical section', 'semaphore'],
  'deadlock':                 ['deadlock detection', 'deadlock prevention', 'deadlock avoidance'],
  'virtual memory':           ['paging', 'page fault', 'demand paging', 'page replacement'],
  'process scheduling':       ['cpu scheduling', 'round robin', 'sjf', 'fcfs', 'priority scheduling'],
  'cache memory':             ['cache', 'cache hit', 'cache miss', 'locality of reference'],
  'instruction pipeline':     ['pipelining', 'pipeline stages', 'data hazard', 'control hazard'],
};

// Build reverse lookup: alias → canonical
const _ALIAS_MAP = new Map();
for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
  for (const alias of aliases) {
    _ALIAS_MAP.set(alias, canonical);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Tokeniser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lowercase, remove stop words, keep tokens ≥ 3 chars.
 * Also expands synonyms: if a token matches an alias, the canonical form is added.
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  const raw    = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const tokens = new Set();

  for (const t of raw) {
    if (t.length < 3 || STOP_WORDS.has(t)) continue;
    tokens.add(t);
    // Expand aliases — single-word check
    if (_ALIAS_MAP.has(t)) tokens.add(_ALIAS_MAP.get(t).split(' ')[0]);
  }

  // Multi-word alias check (bigrams / trigrams)
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ').trim();
      if (_ALIAS_MAP.has(phrase)) {
        // Add each word of the canonical term
        for (const w of _ALIAS_MAP.get(phrase).split(' ')) {
          if (w.length >= 3) tokens.add(w);
        }
      }
    }
  }

  return tokens;
}


// ─────────────────────────────────────────────────────────────────────────────
// Jaccard recall-biased overlap score
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score ∈ [0, 1].  Recall-biased: |intersection| / |topic_tokens|
 * so a short, specific topic phrase is easier to match than a broad one.
 * @param {string} questionText
 * @param {string} topicStr
 * @returns {number}
 */
export function keywordOverlapScore(questionText, topicStr) {
  const qTokens = tokenize(questionText);
  const tTokens = tokenize(topicStr);
  if (qTokens.size === 0 || tTokens.size === 0) return 0;

  let intersect = 0;
  for (const t of tTokens) {
    if (qTokens.has(t)) intersect++;
  }
  return intersect / tTokens.size;
}


// ─────────────────────────────────────────────────────────────────────────────
// Confidence labelling
// ─────────────────────────────────────────────────────────────────────────────

const MIN_CONFIDENCE = 0.40;
const TOP_K          = 3;

function confidenceLabel(score) {
  if (score >= 0.70) return 'Strong';
  if (score >= 0.40) return 'Medium';
  return 'Weak';
}


// ─────────────────────────────────────────────────────────────────────────────
// Core scorer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enrich each question with matched topics from its own module.
 *
 * @param {Array<{text, q_num, module, source}>} questions   Flat list of all questions
 * @param {Array<{topic, module, module_title}>}  syllabusFlat
 * @returns {Array}  questions with added { topics[], primary_module, is_uncertain }
 */
export function scoreQuestionsAgainstSyllabus(questions, syllabusFlat) {
  return questions.map(q => {
    const targetModule = q.module || 0;

    // Strict module isolation
    const localTopics = targetModule > 0
      ? syllabusFlat.filter(t => t.module === targetModule)
      : syllabusFlat;

    if (!localTopics.length) {
      return { ...q, topics: [], primary_module: targetModule, is_uncertain: true };
    }

    // Score each topic
    const scored = localTopics.map(topicInfo => ({
      score:     keywordOverlapScore(q.text, topicInfo.topic),
      topicInfo,
    }));

    // Sort descending, take top-K above threshold
    scored.sort((a, b) => b.score - a.score);
    const topScore = scored[0]?.score ?? 0;

    const assigned = scored
      .slice(0, TOP_K)
      .filter(({ score }) => score >= MIN_CONFIDENCE)
      .map(({ score, topicInfo }) => ({
        name:         topicInfo.topic,
        module:       topicInfo.module,
        module_title: topicInfo.module_title,
        score:        Math.round(score * 10000) / 10000,
        label:        confidenceLabel(score),
      }));

    return {
      ...q,
      topics:         assigned,
      primary_module: assigned[0]?.module ?? targetModule,
      is_uncertain:   topScore < 0.40,
    };
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Frequency aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count how often each topic appears across all questions.
 *
 * @param {Array}  allEnrichedQuestions
 * @param {Array}  syllabusFlat  (to pre-seed all topics with zero counts)
 * @returns {Object}  { topicName: { count, raw_count, module, module_title, questions[] } }
 */
export function computeTopicFrequency(allEnrichedQuestions, syllabusFlat = []) {
  const freq = {};

  // Pre-seed every topic so it appears in charts even with 0 occurrences
  for (const st of syllabusFlat) {
    if (!freq[st.topic]) {
      freq[st.topic] = {
        count:        0,
        raw_count:    0,
        module:       st.module,
        module_title: st.module_title,
        questions:    [],
      };
    }
  }

  for (const q of allEnrichedQuestions) {
    for (const t of (q.topics || [])) {
      if (!freq[t.name]) {
        freq[t.name] = { count: 0, raw_count: 0, module: t.module, module_title: t.module_title, questions: [] };
      }
      freq[t.name].count    += t.score;
      freq[t.name].raw_count += 1;
      freq[t.name].module        = t.module;
      freq[t.name].module_title  = t.module_title;
      freq[t.name].questions.push({
        text:   q.text,
        q_num:  q.q_num,
        source: q.source || '',
        score:  t.score,
      });
    }
  }

  return freq;
}

/**
 * Return topics sorted by raw_count descending (optionally filtered by module).
 * @param {Object}   freq
 * @param {number|null} module
 * @returns {Array}
 */
export function getRankedTopics(freq, module = null) {
  const items = Object.entries(freq)
    .filter(([, v]) => module === null || v.module === module)
    .map(([topic, v]) => ({ topic, ...v }));

  items.sort((a, b) => b.raw_count - a.raw_count || b.count - a.count);
  return items;
}
