import 'server-only';

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
  const withBase = html.replace('<head>', `<head>\n<base href="${baseUrl}/" />`);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // 'load' (the default, and the only option setContent supports) fires
    // after the letterhead logo <img> finishes loading too.
    await page.setContent(withBase, { waitUntil: 'load' });
    // The report HTML hides its on-page "Print / Save as PDF" toolbar (and
    // sets @page size/margins) under `@media print` — same CSS a real print
    // dialog would apply, so this keeps one styling source of truth.
    await page.emulateMediaType('print');
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Wrap a generated buffer as a downloadable .pdf HTTP response. */
export function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
