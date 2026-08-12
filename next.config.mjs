/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @sparticuz/chromium resolves its brotli binary via relative fs paths at
  // runtime; letting webpack bundle it breaks that, so it (and puppeteer-core,
  // which loads it) must ship untouched in node_modules — see src/lib/reports/pdf.ts.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
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
