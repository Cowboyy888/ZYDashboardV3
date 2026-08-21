import 'server-only';
import { buildCjkFontFaceCss } from './fonts/cjk-subset';

/**
 * Renders one of this app's self-contained branded report HTML documents
 * (inquiry-report-html.ts, quotation-doc-html.ts, deposit-invoice-html.ts,
 * sales-order-html.ts, purchase-order-html.ts) to a real PDF file, server-side.
 *
 * Replaces the old "open a popup, document.write the HTML, let the user hit
 * Print / Save as PDF" flow: iOS Safari's native print sheet (AirPrint) has
 * no visible "save as PDF" — only a hidden pinch-to-preview → Share → Save to
 * Files gesture — so on iPhone that flow looked like downloading was broken.
 * A real PDF response, downloaded the same way the Excel exports already are,
 * works identically everywhere.
 *
 * Two launch paths:
 *   - On Vercel (`VERCEL` env var is always set on deployed functions):
 *     puppeteer-core + @sparticuz/chromium's prebuilt Linux binary.
 *   - Locally: puppeteer-core against the developer's installed Chrome
 *     (`channel: 'chrome'`) — no Chromium download, no devDependency.
 */
async function launchBrowser() {
  const puppeteer = await import('puppeteer-core');
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return puppeteer.launch({ channel: 'chrome', headless: true });
}

type Browser = Awaited<ReturnType<typeof launchBrowser>>;

/**
 * Reused across warm invocations of the same function instance — Vercel
 * Fluid Compute keeps module scope alive between requests, so caching the
 * browser here avoids paying Chromium's ~1-3s cold-launch cost on every
 * single PDF. Concurrent requests hitting the same warm instance share this
 * one browser but each get their own page/tab: renderHtmlToPdf only ever
 * closes ITS OWN page, never the shared browser, so one request finishing
 * can't kill a sibling request still rendering.
 *
 * Caches the in-flight launch PROMISE (not the resolved browser), so two
 * concurrent cold calls that both see no cache yet await the same launch
 * instead of racing to start two Chromiums. `launching` is captured in the
 * closure so a stale disconnect/failure can only clear ITS OWN cache entry —
 * not one a later, newer launch already replaced it with.
 */
let cachedBrowser: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!cachedBrowser) {
    const launching = launchBrowser();
    cachedBrowser = launching;
    launching
      .then((browser) => {
        // Crashed or was killed — drop the cache so the next call relaunches
        // instead of reusing a dead process.
        browser.once('disconnected', () => {
          if (cachedBrowser === launching) cachedBrowser = null;
        });
      })
      .catch(() => {
        if (cachedBrowser === launching) cachedBrowser = null;
      });
  }
  return cachedBrowser;
}

export interface RenderPdfOptions {
  /**
   * Origin (e.g. `https://app.example.com`) to resolve the report's
   * `/brand/zysteel-logo.png` <img> against — page.setContent() has no
   * implied base URL the way a same-origin popup window does, so relative
   * asset paths silently fail to load without this.
   */
  baseUrl: string;
}

/** Render a self-contained report HTML string to a PDF buffer. */
export async function renderHtmlToPdf(
  html: string,
  { baseUrl }: RenderPdfOptions,
): Promise<Buffer> {
  // Subset Noto Sans SC down to just this document's actual Chinese
  // characters and inject it — see fonts/cjk-subset.ts for why a static
  // embed (like fonts/noto-sans-khmer.ts) doesn't work for a full CJK font.
  const cjkFontFace = await buildCjkFontFaceCss(html);
  const withBase = html.replace('<head>', `<head>\n<base href="${baseUrl}/" />${cjkFontFace}`);

  let browser = await getBrowser();
  let page;
  try {
    page = await browser.newPage();
  } catch {
    // The cached browser was dead (crashed without a 'disconnected' event
    // having fired yet) — force a fresh one and retry once.
    cachedBrowser = null;
    browser = await getBrowser();
    page = await browser.newPage();
  }
  try {
    // 'load' (the default, and the only option setContent supports) fires
    // after the letterhead logo <img> finishes loading too.
    await page.setContent(withBase, { waitUntil: 'load' });
    // Embedded @font-face data (e.g. the Khmer subset — see
    // fonts/noto-sans-khmer.ts) decodes asynchronously and isn't guaranteed
    // ready by the 'load' event, so wait for it explicitly or page.pdf() can
    // snapshot before it applies, printing tofu boxes for that text.
    await page.evaluateHandle('document.fonts.ready');
    // The report HTML hides its on-page "Print / Save as PDF" toolbar (and
    // sets @page size/margins) under `@media print` — same CSS a real print
    // dialog would apply, so this keeps one styling source of truth.
    await page.emulateMediaType('print');
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    // Close only this request's page — the browser is shared across warm
    // invocations (see getBrowser) and must stay alive for the next one.
    await page.close();
  }
}

/**
 * Wrap a generated buffer as a viewable .pdf HTTP response — `inline`, not
 * `attachment`, so the browser opens it in its own native PDF viewer (Chrome,
 * desktop Safari, and iOS Safari all support this well) instead of silently
 * downloading it. That viewer supplies its own Print and Save/Download
 * controls — reliable on every platform, unlike printing an HTML page.
 */
export function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
