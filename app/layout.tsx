import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "vid2md — Turn any video into clean Markdown",
  description:
    "Paste a video URL, get a clean Markdown file for Obsidian, Logseq, or AI ingestion. No proprietary service, no lock-in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
