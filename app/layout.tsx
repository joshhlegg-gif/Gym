import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gym',
  description: 'Training and body composition.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app is installed to a home screen and used one-handed at 6am.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-dvh antialiased">
        <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">{children}</div>
        <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl">
            {[
              { href: '/', label: 'Today' },
              { href: '/dashboard', label: 'Dashboard' },
            ].map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 py-4 text-center text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
      </body>
    </html>
  );
}
