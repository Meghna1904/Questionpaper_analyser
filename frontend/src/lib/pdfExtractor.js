/**
 * pdfExtractor.js — Client-side PDF text extraction using pdf.js
 * =================================================================
 * Uses pdfjs-dist to extract embedded text from digital PDFs.
 * Detects scanned / low-text PDFs and returns a clear error instead
 * of silently failing.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Use the CDN worker — avoids Vite bundling issues with pdf.js internals
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const MIN_CHARS_PER_PAGE = 80; // below this → probably a scanned/image PDF

/**
 * Extract all text from a single PDF File object.
 *
 * @param {File} file
 * @returns {Promise<{ text: string, pageCount: number, error: string|null }>}
 */
export async function extractTextFromPDF(file) {
  let pdf;
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (e) {
    return { text: '', pageCount: 0, error: `Failed to open PDF: ${e.message}` };
  }

  const pageCount = pdf.numPages;
  const pageTexts = [];
  let totalChars = 0;

  for (let i = 1; i <= pageCount; i++) {
    try {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Join items using Y-coordinate differences to reconstruct lines
      let pageText = '';
      let lastY = null;
      for (const item of content.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 4) {
          pageText += '\n'; // Y coordinate changed significantly -> new line
        } else if (lastY !== null) {
          // Same line, add a space to separate words if not already ending in space
          if (!pageText.endsWith(' ') && !item.str.startsWith(' ')) {
            pageText += ' ';
          }
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
      
      pageTexts.push(pageText.trim());
      totalChars += pageText.replace(/\s/g, '').length;
    } catch {
      pageTexts.push(''); // skip unreadable page
    }
  }

  const fullText   = pageTexts.join('\n');
  const avgPerPage = pageCount > 0 ? totalChars / pageCount : 0;

  // Explicit scanned-PDF guard — never silent fail
  if (avgPerPage < MIN_CHARS_PER_PAGE) {
    return {
      text:      fullText,
      pageCount,
      error:
        'This PDF appears to be scanned or image-based. ' +
        'pdf.js can only read digital (text-layer) PDFs. ' +
        'Please use a digitally-created PDF for best results.',
    };
  }

  return { text: fullText, pageCount, error: null };
}
