import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Watch2Text: turn any video or article into clean, readable Markdown",
  description:
    "Paste a video or article URL, get a clean Markdown file with real paragraphs, YAML frontmatter, and timestamp links. Built for note-takers, researchers, and AI workflows. No proprietary service, no lock-in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
