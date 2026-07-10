import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhotoAI — find your event photos",
  description: "Event photography with private face search",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
