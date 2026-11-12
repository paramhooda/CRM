import type { NextConfig } from "next";
import pkg from "./package.json";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Shown on the admin page and in the start-up log so everyone knows which release is running
  env: { APP_VERSION: pkg.version },
  experimental: {
    // Document uploads (up to 15 MB, src/lib/documents.ts) pass through the auth middleware, which caps bodies at 10 MB
    middlewareClientMaxBodySize: "20mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
