import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AimedProvider } from "@/context/AimedContext";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://aimed-pico.vercel.app"),
  title: "AIMed — Multi-Specialty Medical Intelligence Platform",
  description:
    "AI-assisted clinical question formulation, multi-database evidence mapping, and publication-grade commentary synthesis across medical specialties.",
  applicationName: "AIMed",
  keywords: [
    "AIMed",
    "Medical Intelligence",
    "PICO Question",
    "Evidence-Based Medicine",
    "Clinical Research",
    "Vancouver Citation",
    "PubMed Synthesis"
  ],
  authors: [{ name: "AIMed Medical Intelligence Team" }],
  creator: "AIMed",
  publisher: "AIMed",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon-precomposed.png", sizes: "180x180", type: "image/png" }
    ],
    shortcut: ["/favicon.ico"]
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://aimed-pico.vercel.app",
    siteName: "AIMed",
    title: "AIMed — Multi-Specialty Medical Intelligence Platform",
    description:
      "AI-assisted clinical question formulation, multi-database evidence mapping, and publication-grade commentary synthesis across medical specialties.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AIMed - Multi-Specialty Medical Intelligence Platform",
        type: "image/png"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "AIMed — Multi-Specialty Medical Intelligence Platform",
    description:
      "AI-assisted clinical question formulation, multi-database evidence mapping, and publication-grade commentary synthesis across medical specialties.",
    images: ["/og-image.png"]
  },
  appleWebApp: {
    capable: true,
    title: "AIMed",
    statusBarStyle: "black-translucent"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AimedProvider>{children}</AimedProvider>
      </body>
    </html>
  );
}
