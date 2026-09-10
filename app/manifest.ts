import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CyberDev POS",
    short_name: "CyberDev POS",
    description: "Platform kasir pintar untuk retail, F&B, dan bisnis jasa.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#6957f5",
    orientation: "any",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
