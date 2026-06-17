import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mobile A11y Crawler",
  description: "Self-hosted accessibility crawler for Expo and React Native apps.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `
    (() => {
      try {
        const stored = localStorage.getItem("theme");
        const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        document.documentElement.dataset.theme = stored === "light" || stored === "dark" ? stored : system;
      } catch {
        document.documentElement.dataset.theme = "light";
      }
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
