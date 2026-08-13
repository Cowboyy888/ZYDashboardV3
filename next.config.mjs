/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @sparticuz/chromium resolves its brotli binary via relative fs paths at
  // runtime; letting webpack bundle it breaks that, so it (and puppeteer-core,
  // which loads it) must ship untouched in node_modules — see src/lib/reports/pdf.ts.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  // serverExternalPackages only stops webpack from mangling the package's JS —
  // it does NOT make Next's output file tracer ship the binary. The tracer
  // follows static imports/requires, but @sparticuz/chromium resolves its
  // ~65MB bin/chromium.br at runtime via a computed path, so the tracer never
  // sees it and the deployed function was missing bin/ entirely (production
  // error: "The input directory .../@sparticuz/chromium/bin does not exist").
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@sparticuz/chromium/bin/**'],
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
