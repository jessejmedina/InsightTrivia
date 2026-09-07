#!/usr/bin/env node
/*
 * De-interleave the two-column OCR dump `data/it2_full.txt` (Insight on the
 * Scriptures, Vol. 2 — a local, gitignored reference file) into a single
 * readable column stream so it can be grepped for phrase-level fact-checking
 * of the trivia question bank.
 *
 * Heuristic, not a typesetter: pages split on form-feed; each body line is
 * cut at the whitespace gutter (~col 52, from a column-space histogram);
 * a page's left column is emitted top-to-bottom, then its right column;
 * hyphenated line-wraps are re-joined; OCR ligatures and curly punctuation
 * are normalized. A handful of words at exact column boundaries get mangled
 * — acceptable for grep, not for reading start to finish.
 *
 * Input  : data/it2_full.txt   (gitignored — never committed)
 * Output : data/it2_clean.txt  (gitignored — never committed)
 *
 * Usage: node scripts/deinterleave-insight.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'data', 'it2_full.txt');
const OUT = path.join(ROOT, 'data', 'it2_clean.txt');

if (!fs.existsSync(IN)) {
  console.error('Missing data/it2_full.txt (the raw Vol. 2 OCR dump). Nothing to do.');
  process.exit(1);
}
const src = fs.readFileSync(IN, 'utf8');

function normalize(s) {
  return s
    .replace(/\r/g, '')
    .replace(/ﬀ/g, 'ff').replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, '--').replace(/–/g, '-')
    .replace(/·/g, '')
    .replace(/­/g, '');
}

function cut(line) {
  const GUT = 52;
  let bestStart = -1, bestLen = 0, runStart = -1;
  const lo = 40, hi = Math.min(line.length, 66);
  for (let c = lo; c <= hi; c++) {
    if (line[c] === ' ' || line[c] === undefined) {
      if (runStart < 0) runStart = c;
    } else if (runStart >= 0) {
      const len = c - runStart;
      if (len >= 2 && runStart <= GUT + 2 && c >= GUT - 2 && len > bestLen) { bestLen = len; bestStart = runStart; }
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const len = (hi + 1) - runStart;
    if (len >= 2 && runStart <= GUT + 2 && len > bestLen) { bestLen = len; bestStart = runStart; }
  }
  if (bestStart < 0) return [line.replace(/\s+$/, ''), ''];
  return [line.slice(0, bestStart).replace(/\s+$/, ''), line.slice(bestStart + bestLen).replace(/\s+$/, '')];
}

function dehyphenateAndJoin(lines) {
  const out = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    if (out.length && /[A-Za-z]-$/.test(out[out.length - 1]) && /^[a-z]/.test(line.trimStart())) {
      out[out.length - 1] = out[out.length - 1].slice(0, -1) + line.trimStart();
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

const pages = normalize(src).split('\f');
const chunks = [];
let bodyPages = 0;
for (const page of pages) {
  const rawLines = page.split('\n');
  let start = 0;
  while (start < rawLines.length && rawLines[start].trim() === '') start++;
  if (start < rawLines.length) {
    const h = rawLines[start].trim();
    if (/^\d+\b/.test(h) || /\b\d+$/.test(h) || (/^[A-Z]/.test(h) && !/[a-z]/.test(h) && h.length < 40)) start++;
  }
  const lefts = [], rights = [];
  for (let i = start; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim() === '') { lefts.push(''); rights.push(''); continue; }
    if (/^\s*\d{1,4}\s*$/.test(line)) continue;
    const [l, r] = cut(line);
    lefts.push(l); rights.push(r);
  }
  const L = dehyphenateAndJoin(lefts).trim();
  const R = dehyphenateAndJoin(rights).trim();
  if (!L && !R) continue;
  bodyPages++;
  chunks.push([L, R].filter(Boolean).join('\n'));
}

const outText = chunks.join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
fs.writeFileSync(OUT, outText, 'utf8');
console.log(`pages: ${bodyPages}/${pages.length}  ->  data/it2_clean.txt  (${(outText.length / 1e6).toFixed(2)} MB)`);
