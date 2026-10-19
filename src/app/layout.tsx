import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

// Where this build is being served from, so that tabs for the same page on
// different hosts can be told apart at a glance. Vercel and GitHub Actions
// each set their variable during the build; anything else is a local run.
const HOST_PREFIX = process.env.VERCEL ? "VRC" : process.env.GITHUB_ACTIONS ? "GTH" : "LCL";

export const metadata: Metadata = {
  title: `${HOST_PREFIX}: Higher-Ed Database`,
  description: "Explore IPEDS data on colleges, universities, and graduate schools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href="/" className="whitespace-nowrap text-sm font-semibold tracking-tight">
              Higher-Ed Database
            </Link>
            <nav className="flex gap-4 whitespace-nowrap sm:gap-5">
              <Link href="/institutions" className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                Browse
              </Link>
              <Link href="/triangle" className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                Compare 3
              </Link>
              <Link href="/compare" className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                Compare
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
