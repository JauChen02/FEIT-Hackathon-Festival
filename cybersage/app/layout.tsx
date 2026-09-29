import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CyberSage — Powered by Untapped",
  description: "AI-powered cybersecurity learning. Scenarios, rankings, live classrooms.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
