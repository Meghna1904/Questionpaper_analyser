/**
 * syllabusParser.js — Parse user-pasted syllabus text into structured modules
 * =============================================================================
 * Expected input format (flexible):
 *
 *   Module 1 (Introduction to Automata)
 *   Finite Automata, DFA, NFA, Regular Expressions
 *
 *   Module 2 (Context-Free Languages)
 *   CFG, Pushdown Automata, CYK Algorithm
 *   ...
 *
 * Returns:
 *   {
 *     1: { title: "Introduction to Automata", topics: ["Finite Automata", ...] },
 *     2: { ... },
 *     ...
 *   }
 */

const MODULE_HEADER_RE = /^(?:module|mod\.?)\s*([1-5IVX]+)[:\s\-–—]*(.*)/i;
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

function romanOrInt(str) {
  const up = str.trim().toUpperCase();
  if (ROMAN[up] !== undefined) return ROMAN[up];
  const n = parseInt(str, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * @param {string} text  Raw syllabus pasted by user
 * @returns {Object}     { moduleNumber: { title, topics[] } }
 */
export function parseSyllabus(text) {
  if (!text || !text.trim()) return {};

  const result = {};
  let currentModule = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = MODULE_HEADER_RE.exec(line);
    if (headerMatch) {
      const modNum = romanOrInt(headerMatch[1]);
      if (modNum < 1 || modNum > 5) continue;

      // Title is inside parentheses or trailing text after the module number
      let title = headerMatch[2].trim();
      // Strip surrounding parens if present: "( Introduction )"
      title = title.replace(/^\((.+)\)$/, '$1').trim();
      if (!title) title = `Module ${modNum}`;

      result[modNum] = { title, topics: [] };
      currentModule = modNum;
      continue;
    }

    // Everything else under a module header = topic line
    if (currentModule !== null && result[currentModule]) {
      // Topics can be comma-separated or newline-separated or semicolons
      const raw = line.replace(/[;]/g, ',');
      const topics = raw
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 2);
      result[currentModule].topics.push(...topics);
    }
  }

  // Fallback: if nothing parsed cleanly, put everything in module 1
  if (Object.keys(result).length === 0 && text.trim()) {
    const topics = text
      .split(/[\n,;]+/)
      .map(t => t.trim())
      .filter(t => t.length > 2);
    result[1] = { title: 'Module 1', topics };
  }

  return result;
}

/**
 * Flatten the nested syllabus structure into a list suitable for scoring.
 * @param {Object} syllabus  Output of parseSyllabus()
 * @returns {Array}  [{ topic, module, module_title }, ...]
 */
export function flattenSyllabus(syllabus) {
  const flat = [];
  for (const [modNumStr, data] of Object.entries(syllabus)) {
    const modNum = parseInt(modNumStr, 10);
    for (const topic of data.topics) {
      flat.push({ topic, module: modNum, module_title: data.title });
    }
  }
  return flat;
}
