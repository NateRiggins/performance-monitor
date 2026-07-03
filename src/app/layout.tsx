import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Performance Monitor',
  description: 'PageSpeed / Core Web Vitals across the fleet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <header className="flex items-center gap-6 border-b border-neutral-800 px-5 py-3">
          <span className="font-semibold">⚡ Performance Monitor</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-neutral-300 hover:text-white">Dashboard</Link>
            <Link href="/settings" className="text-neutral-300 hover:text-white">Settings</Link>
          </nav>
        </header>
        <main className="p-5">{children}</main>
      </body>
    </html>
  );
}
