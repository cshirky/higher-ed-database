import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Higher-Ed Database",
  description: "Explore IPEDS data on colleges, universities, and graduate schools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/" className="text-sm font-semibold tracking-tight">
              Higher-Ed Database
            </a>
            <nav className="flex gap-5">
              <a href="/institutions" className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                Browse
              </a>
              <a href="/compare" className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                Compare
              </a>
            </nav>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
