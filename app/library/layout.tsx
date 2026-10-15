import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Library · Watch2Text",
  description: "Download videos to watch offline. Runs on your own computer.",
  robots: { index: false, follow: false },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
