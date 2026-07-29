import type { Metadata, Viewport } from 'next';
import { Noto_Sans_SC, Noto_Sans_Khmer } from 'next/font/google';
import './globals.css';
import { getLocale } from '@/lib/i18n/locale';

/**
 * Self-hosted via next/font instead of the `@import url(fonts.googleapis.com/...)`
 * this used to be in globals.css. That import was on the critical rendering
 * path for every single page (including the unauthenticated login screen):
 * the browser can't discover an `@import` until it has already fetched and
 * parsed globals.css, then has to round-trip to fonts.googleapis.com for the
 * stylesheet and fonts.gstatic.com for the actual woff2 files — three extra
 * sequential hops, two of them cross-origin, before first paint. Measured on
 * production: first paint was blocked on exactly that chain (~250ms of it
 * just the googleapis.com round trip). next/font downloads the same files at
 * BUILD time and serves them self-hosted from this app's own origin, so none
 * of that happens at request time.
 *
 * Noto Sans SC's CJK glyphs ship unconditionally regardless of `subsets` —
 * only `latin`/`latin-ext`/`cyrillic`/`vietnamese` are selectable subsets for
 * this family (there's no separate "chinese-simplified" opt-in), verified
 * against next/font's own Google Fonts metadata before assuming so.
 */
const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-sans',
});

const notoSansKhmer = Noto_Sans_Khmer({
  subsets: ['khmer', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-khmer',
});

export const metadata: Metadata = {
  title: 'Zysteel Operations · 中粤铁网 运营系统',
  description:
    'Attendance, inventory ledger, and Telegram operations reporting for 中粤铁网 (Zysteel).',
};

export const viewport: Viewport = {
  themeColor: '#c81e33',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale === 'zh' ? 'zh-Hans' : 'en'}
      className={`${notoSansSC.variable} ${notoSansKhmer.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
