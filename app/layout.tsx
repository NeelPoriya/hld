import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === 'production'
      ? 'https://neelporiya.github.io/hld'
      : 'http://localhost:3000',
  ),
  title: {
    default: 'HLD Cheat Sheet',
    template: '%s · HLD Cheat Sheet',
  },
  description:
    'A revision-friendly knowledge base of the technologies that come up most often in High Level Design (HLD) / System Design interviews.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
