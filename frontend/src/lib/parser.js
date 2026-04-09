/**
 * parser.js — JS port of backend/parser.py
 * ==========================================
 * Layers:
 *  1. OCR character-confusion fixes
 *  2. Noise removal (headers, footers, metadata)
 *  3. Broken-line merging
 *  4. Question extraction (Part A Q1–10, Part B Q11–20)
 *
 * KTU fixed module mapping
 *   Part A: Q1-2 → M1 | Q3-4 → M2 | Q5-6 → M3 | Q7-8 → M4 | Q9-10 → M5
 *   Part B: Q11-12 → M1 | Q13-14 → M2 | Q15-16 → M3 | Q17-18 → M4 | Q19-20 → M5
 */

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1: OCR fixes
// ─────────────────────────────────────────────────────────────────────────────

const OCR_FIXES = [
  [/\bQl\b/g,              'Q1'],
  [/\bQ\|\b/g,             'Q1'],
  [/\bOl\b/g,              'Q1'],
  [/\bl\)/g,               '1)'],
  [/\ba\]/g,               'a)'],
  [/\bb\]/g,               'b)'],
  [/(?<!\w)l(\d)/g,        '1$1'],
  [/\s\|\s/g,              ' '],
  [/[ \t]+/g,              ' '],
  [/\n{4,}/g,              '\n\n\n'],
];

export function fixOcrErrors(text) {
  let t = text;
  for (const [pattern, replacement] of OCR_FIXES) {
    t = t.replace(pattern, replacement);
  }
  return t.trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2: Noise removal
// ─────────────────────────────────────────────────────────────────────────────

const NOISE_PATTERNS = [
  /^0400CST\d+/i,
  /^Page\s+\d+\s*(of|Of)\s*\d+/,
  /^APJ\s+ABDUL\s+KALAM/i,
  /^Eighth\s+Semester/i,
  /^(Reg\s*No|Name)\s*:/i,
  /^\*+$/,
  /^C\s*$/,
  /^A\s*$/,
  /^Pages:\s*\d+/i,
  /^Max\.?\s*Marks:/i,
  /^Duration:/i,
  /^Course\s*(Code|Name):/i,
  /^Marks\s*$/,
  /^Answer\s+(all|any)/i,
  /^Time\s*:\s*\d/i,
];

export function removeNoise(text) {
  return text
    .split('\n')
    .filter(line => {
      const s = line.trim();
      if (!s) return true; // keep blank separators
      return !NOISE_PATTERNS.some(p => p.test(s));
    })
    .join('\n');
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3: Line merging
// ─────────────────────────────────────────────────────────────────────────────

const MARKS_TRAILING = /\(\d+\)\s*$/;
const RE_PART_HDR    = /^PART\s*[AB]/i;
const RE_MODULE_HDR  = /^Module\s*[IVX\d]+/i;
const RE_OR          = /^OR\s*$/i;
const RE_PART_B_Q    = /^\d{2}\s+[a-d]\)/i;
const RE_PART_A_NUM  = /^(10|[1-9])\s*$/;
const RE_PART_A_FULL = /^(10|[1-9])\s+(.+)/s;
const RE_SUB_ONLY    = /^[a-d]\)\s+\S/i;

function isStructureBreak(line) {
  return (
    RE_PART_HDR.test(line)   ||
    RE_MODULE_HDR.test(line) ||
    RE_OR.test(line)         ||
    RE_PART_B_Q.test(line)   ||
    RE_PART_A_NUM.test(line) ||
    RE_PART_A_FULL.test(line) ||
    RE_SUB_ONLY.test(line)
  );
}

export function mergeBrokenLines(text) {
  const rawLines = text.split('\n');
  const merged   = [];
  let   buffer   = '';
  let   prevWasBareNum = false;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const clean     = line.replace(MARKS_TRAILING, '').trim();
    if (!clean) continue;

    const isBreak   = isStructureBreak(clean);
    const isBareNum = RE_PART_A_NUM.test(clean);

    if (isBreak) {
      if (isBareNum) {
        if (buffer) merged.push(buffer.trim());
        buffer           = clean;
        prevWasBareNum   = true;
      } else {
        if (buffer) merged.push(buffer.trim());
        buffer           = clean;
        prevWasBareNum   = false;
      }
    } else {
      if (buffer) {
        buffer = prevWasBareNum
          ? buffer + ' ' + clean      // "3 Define entropy..."
          : buffer + ' ' + clean;
        prevWasBareNum = false;
      } else {
        buffer = clean;
      }
    }
  }
  if (buffer) merged.push(buffer.trim());
  return merged;
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4: Module mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPartAModule(qNum) {
  if (qNum <= 2)  return 1;
  if (qNum <= 4)  return 2;
  if (qNum <= 6)  return 3;
  if (qNum <= 8)  return 4;
  return 5;
}

function getPartBModule(qNum) {
  if (qNum <= 12) return 1;
  if (qNum <= 14) return 2;
  if (qNum <= 16) return 3;
  if (qNum <= 18) return 4;
  return 5;
}

const ROMAN_MAP = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
function romanToInt(s) {
  return ROMAN_MAP[s.toUpperCase()] || parseInt(s, 10) || 0;
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 5: Inline sub-question splitter
// ─────────────────────────────────────────────────────────────────────────────

// Matches " b) " / " c) " etc. embedded inside text
const INLINE_SUB_RE = /\s+([b-d])\)\s+/g;

function splitInlineSubs(firstMarker, text) {
  const parts = text.split(INLINE_SUB_RE);
  // split() with a capture group → ['text_a', 'b', 'text_b', 'c', 'text_c', ...]
  if (parts.length === 1) {
    return [{ marker: firstMarker, text: text.trim() }];
  }
  const result = [{ marker: firstMarker, text: parts[0].trim() }];
  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      result.push({ marker: parts[i], text: parts[i + 1].trim() });
    }
  }
  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// LAYER 6: Question extraction
// ─────────────────────────────────────────────────────────────────────────────

// Part A: "1 Define entropy" — standalone number + text
const PART_A_Q_RE    = /^(10|[1-9])\s+(.+)/s;

// Part B main: "11 a) Explain..."
const PART_B_MAIN_RE = /^(\d{2})\s+([a-d])\)\s*(.+)/s;

// Standalone sub-question continuation: "b) Compare..."
const SUB_ONLY_RE    = /^([a-d])\)\s*(.+)/s;

// Section / module headers
const PART_A_RE      = /^PART\s*A/i;
const PART_B_RE      = /^PART\s*B/i;
const MODULE_HDR_RE  = /^Module\s*([IVX\d]+)/i;
const OR_RE          = /^OR\s*$/i;

/**
 * @param {string[]} mergedLines
 * @param {string}   source       Filename
 * @returns {{ source, part_a[], part_b[] }}
 */
export function extractQuestions(mergedLines, source = '') {
  const result = { source, part_a: [], part_b: [] };

  let section       = null;   // 'A' | 'B'
  let currentModule = 0;
  let currentMainQ  = null;
  let isAfterOr     = false;

  for (const line of mergedLines) {
    // ── Section headers ──────────────────────────────────────────────────
    if (PART_A_RE.test(line)) { section = 'A'; continue; }
    if (PART_B_RE.test(line)) { section = 'B'; continue; }

    // ── Module header ────────────────────────────────────────────────────
    const modMatch = MODULE_HDR_RE.exec(line);
    if (modMatch) {
      currentModule = romanToInt(modMatch[1]);
      isAfterOr     = false;
      currentMainQ  = null;
      continue;
    }

    // ── OR separator ─────────────────────────────────────────────────────
    if (OR_RE.test(line)) {
      isAfterOr    = true;
      currentMainQ = null;
      continue;
    }

    // ── PART A ───────────────────────────────────────────────────────────
    if (section === 'A') {
      const m = PART_A_Q_RE.exec(line);
      if (m) {
        const qNum   = parseInt(m[1], 10);
        const module = getPartAModule(qNum);
        result.part_a.push({ q_num: qNum, text: m[2].trim(), module, source });
      }
      continue;
    }

    // ── PART B ───────────────────────────────────────────────────────────
    if (section === 'B') {
      const mainM = PART_B_MAIN_RE.exec(line);
      if (mainM) {
        const qNum   = parseInt(mainM[1], 10);
        const marker = mainM[2];
        const rawTxt = mainM[3].trim();
        const module = getPartBModule(qNum);

        if (!currentMainQ || currentMainQ.q_num !== qNum) {
          currentMainQ = {
            q_num:         qNum,
            module,
            is_or_variant: isAfterOr,
            sub_questions: [],
            source,
          };
          result.part_b.push(currentMainQ);
        }
        currentMainQ.sub_questions.push(...splitInlineSubs(marker, rawTxt));
        continue;
      }

      // Standalone sub-question continuation
      const subM = SUB_ONLY_RE.exec(line);
      if (subM && currentMainQ) {
        currentMainQ.sub_questions.push(
          ...splitInlineSubs(subM[1], subM[2].trim())
        );
      }
    }
  }

  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full pipeline: raw PDF text → structured question object.
 *
 * @param {string} rawText   From pdfExtractor
 * @param {string} filename
 * @param {string|null} extractionError  Passed through from pdfExtractor
 */
export function parsePDFText(rawText, filename = '', extractionError = null) {
  const fixed   = fixOcrErrors(rawText);
  const clean   = removeNoise(fixed);
  const merged  = mergeBrokenLines(clean);
  const parsed  = extractQuestions(merged, filename);

  parsed.error = extractionError;
  return parsed;
}
