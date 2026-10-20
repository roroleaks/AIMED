import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AIMed — Medical Intelligence Platform",
    short_name: "AIMed",
    description:
      "AI-assisted clinical question formulation, multi-database evidence mapping, and publication-grade commentary synthesis across medical specialties.",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d071a",
    theme_color: "#0f766e",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any"
      }
    ],
    categories: ["medical", "health", "productivity", "education"]
  };
}
