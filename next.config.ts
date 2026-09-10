import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      {key: "X-Content-Type-Options", value: "nosniff"},
      {key: "X-Frame-Options", value: "DENY"},
      {key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups"},
      {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
      {key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=()"},
      {key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob: https://lh3.googleusercontent.com; font-src 'self' data:; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"},
    ]}];
  },
};

export default nextConfig;
