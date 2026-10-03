import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClockProvider } from "@/components/clock";
import "../globals.css";

// A broadcast surface: a fully transparent page for an OBS browser source.
export const metadata: Metadata = {
  title: "Overlay",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 1920, initialScale: 1 };

export default function OverlayRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} style={{ background: "transparent" }}>
      <body className="overflow-hidden bg-transparent">
        <ClockProvider serverNow={Date.now()}>{children}</ClockProvider>
      </body>
    </html>
  );
}
