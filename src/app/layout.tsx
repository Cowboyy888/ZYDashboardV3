import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getLocale } from '@/lib/i18n/locale';

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
    <html lang={locale === 'zh' ? 'zh-Hans' : 'en'} suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
