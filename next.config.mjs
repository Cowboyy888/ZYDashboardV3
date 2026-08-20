/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @sparticuz/chromium resolves its brotli binary via relative fs paths at
  // runtime; letting webpack bundle it breaks that, so it (and puppeteer-core,
  // which loads it) must ship untouched in node_modules — see src/lib/reports/pdf.ts.
  // subset-font pulls in harfbuzzjs's hb-subset.wasm, which webpack refuses to
  // parse at all without enabling an experimental WASM mode — same fix as
  // chromium: leave it as a plain runtime require instead (fonts/cjk-subset.ts).
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'subset-font'],
  // serverExternalPackages only stops webpack from mangling the package's JS —
  // it does NOT make Next's output file tracer ship the binary. The tracer
  // follows static imports/requires, but @sparticuz/chromium resolves its
  // ~65MB bin/chromium.br at runtime via a computed path, so the tracer never
  // sees it and the deployed function was missing bin/ entirely (production
  // error: "The input directory .../@sparticuz/chromium/bin does not exist").
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/@sparticuz/chromium/bin/**',
      // fonts/cjk-subset.ts reads these full Noto Sans SC source OTFs via fs
      // at runtime (to subset from), not via a static import, so the tracer
      // never sees them on its own — same gap as the chromium binary above.
      './src/lib/reports/fonts/source/**',
      // subset-font resolves this via a static require.resolve(), which the
      // tracer should follow on its own — included explicitly anyway, since
      // it can't be verified against Vercel's actual Chromium build locally.
      './node_modules/harfbuzzjs/*.wasm',
    ],
  },
  experimental: {
    // Server Actions are enabled by default in Next 15; keep body limit sane for uploads.
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
  // Supabase Storage signed URLs are served from the project domain; images are
  // rendered via <img> with signed URLs, so no remotePatterns are required for MVP.
};

export default nextConfig;
