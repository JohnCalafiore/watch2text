import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watch2Text — Turn any video into clean, readable text",
  description:
    "Paste a video URL, get a clean Markdown transcript you can read, search, and keep. Built for note-takers, researchers, and AI workflows. No proprietary service, no lock-in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
