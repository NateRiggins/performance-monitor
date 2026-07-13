import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import SuiteFooter from '@/components/SuiteFooter';

export const metadata: Metadata = {
  title: 'Performance Monitor',
  description: 'PageSpeed / Core Web Vitals across the fleet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100 antialiased">
        <header className="flex items-center gap-6 border-b border-neutral-800 px-5 py-3">
          <span className="font-semibold">⚡ Performance Monitor</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-neutral-300 hover:text-white">Dashboard</Link>
            <Link href="/settings" className="text-neutral-300 hover:text-white">Settings</Link>
          </nav>
          <form action="/auth/signout" method="post" className="ml-auto">
            <button type="submit" className="text-sm text-neutral-400 hover:text-white">Sign out</button>
          </form>
        </header>
        <main className="flex-1 p-5">{children}</main>
        <SuiteFooter />
      </body>
    </html>
  );
}
