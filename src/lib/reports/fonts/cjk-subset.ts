import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Dynamic, per-document Chinese (Simplified) font subsetting.
 *
 * Same root problem as noto-sans-khmer.ts: Vercel's headless Chromium
 * (@sparticuz/chromium) only bundles Open Sans — no CJK glyphs, and nothing
 * at the OS level to fall back on — so every template's "Noto Sans SC" /
 * "PingFang SC" fallback silently had no font behind it in production.
 *
 * Unlike Khmer, a full Chinese font can't just be embedded once: Noto Sans SC
 * is 16-17MB per weight, and the actual Chinese text varies per document
 * (customer names, product descriptions — not a fixed set of UI labels). So
 * instead of shipping the whole font in every PDF's HTML, this extracts the
 * handful of CJK characters actually present in THIS document, and asks
 * harfbuzz (via subset-font, a small WASM build) to cut a fresh
 * WOFF2 containing only those glyphs — typically a few KB, generated in well
 * under 100ms. The full source OTFs live once in the deployment bundle (see
 * next.config.mjs's outputFileTracingIncludes) purely as subsetting input;
 * they're never sent to a browser.
 *
 * Emits @font-face rules for the family name "Noto Sans SC" — every report
 * template already lists that as a fallback in its font stack, so no
 * template needs to change; this just makes that fallback actually exist.
 */

const SOURCE_DIR = join(process.cwd(), 'src/lib/reports/fonts/source');

let regularFont: Promise<Buffer> | null = null;
let boldFont: Promise<Buffer> | null = null;

function loadSourceFont(file: string): Promise<Buffer> {
  return readFile(join(SOURCE_DIR, file));
}

// CJK Unified Ideographs (+ Ext-A), compatibility ideographs, CJK symbols &
// punctuation, and fullwidth forms — generous but bounded ranges covering
// every Chinese character this app could plausibly render.
const CJK_CHAR_RE = new RegExp(
  '[' +
    '　-〿' + // CJK symbols & punctuation
    '㐀-䶿' + // CJK Unified Ideographs Extension A
    '一-鿿' + // CJK Unified Ideographs
    '豈-﫿' + // CJK Compatibility Ideographs
    '＀-￯' + // Halfwidth and Fullwidth Forms
    ']',
  'gu',
);

/** Unique CJK characters actually present in this document's HTML. */
function extractCjkText(html: string): string {
  const matches = html.match(CJK_CHAR_RE);
  return matches ? Array.from(new Set(matches)).join('') : '';
}

/**
 * Subsets Noto Sans SC (regular + bold) down to just the glyphs this
 * document needs, and returns a <style> block with the two @font-face rules
 * as base64 data URIs — or '' if the document has no CJK text at all, so
 * nothing is wasted on English/Khmer-only documents.
 */
export async function buildCjkFontFaceCss(html: string): Promise<string> {
  const text = extractCjkText(html);
  if (!text) return '';

  const { default: subsetFont } = await import('subset-font');

  regularFont ??= loadSourceFont('NotoSansSC-Regular.otf');
  boldFont ??= loadSourceFont('NotoSansSC-Bold.otf');

  const [regularSubset, boldSubset] = await Promise.all([
    regularFont.then((buf) => subsetFont(buf, text, { targetFormat: 'woff2' })),
    boldFont.then((buf) => subsetFont(buf, text, { targetFormat: 'woff2' })),
  ]);

  return `<style>
@font-face {
  font-family: "Noto Sans SC";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(data:font/woff2;base64,${regularSubset.toString('base64')}) format("woff2");
}
@font-face {
  font-family: "Noto Sans SC";
  font-style: normal;
  font-weight: 700;
  font-display: block;
  src: url(data:font/woff2;base64,${boldSubset.toString('base64')}) format("woff2");
}
</style>`;
}
