import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visionforge",
  description: "Synthetic dataset generator for vision AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center px-4 md:px-6">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold text-lg tracking-tight"
            >
              <span className="text-primary">visionforge</span>
            </Link>
            <nav className="ml-8 flex items-center gap-6 text-sm text-muted-foreground">
              <Link
                href="/"
                className="transition-colors hover:text-foreground"
              >
                Home
              </Link>
              <Link
                href="/dashboard"
                className="transition-colors hover:text-foreground"
              >
                Dashboard
              </Link>
            </nav>
          </div>
        </header>
        <main className="container flex-1 px-4 py-8 md:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
