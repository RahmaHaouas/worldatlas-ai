import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorldAtlas AI — Discover the World. Understand Its Specialties.",
  description:
    "A serverless global geospatial intelligence platform: explore every country's specialties, trade specialization (RCA) and ask a grounded AI assistant.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#050b16", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ink-950 font-sans antialiased">{children}</body>
    </html>
  );
}
