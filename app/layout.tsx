import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "CyberDev POS — Kasir Pintar untuk Semua Bisnis",
  description: "Platform POS dan manajemen kasir SaaS multi-tenant untuk retail, F&B, dan bisnis jasa. Customer Service 082244837977.",
  applicationName: "CyberDev POS",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#6957f5" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body><PwaRegister />{children}</body></html>;
}
