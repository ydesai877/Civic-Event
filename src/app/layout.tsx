import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Civic Events · Sunnyvale",
  description:
    "Every event officially published by the City of Sunnyvale and Sunnyvale Public Library, in one list.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Civic Events
            </Link>
            <span className="text-sm text-[var(--muted)]">Sunnyvale, California</span>
            <Link
              href="/about"
              className="ml-auto text-sm text-[var(--muted)] underline-offset-4 hover:underline"
            >
              How this works
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>

        <footer className="mx-auto max-w-5xl px-5 pb-12 pt-6 text-sm text-[var(--muted)]">
          Events are published by the City of Sunnyvale and Sunnyvale Public Library. This site
          copies what they publish. Always check the official page before you go.
        </footer>
      </body>
    </html>
  );
}
