import { loadWebEnv } from "@event-platform/config";
import type { NextConfig } from "next";

loadWebEnv();

const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
const botBaseUrl = process.env.BOT_INTERNAL_URL ?? "http://localhost:3002";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["sulphate-shown-subtract.ngrok-free.dev"],
  reactStrictMode: true,
  transpilePackages: ["@event-platform/config", "@event-platform/shared-types"],
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }] }, { source: "/delivery", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  async rewrites() {
    return [
      { source: "/api/quick/:path*", destination: `${apiBaseUrl}/quick/:path*` },
      { source: "/orders/:path*", destination: `${apiBaseUrl}/orders/:path*` },
      {
        source: "/auth/:path*",
        destination: `${apiBaseUrl}/auth/:path*`,
      },
      {
        source: "/me",
        destination: `${apiBaseUrl}/me`,
      },
      {
        source: "/me/:path*",
        destination: `${apiBaseUrl}/me/:path*`,
      },
      {
        source: "/api/health",
        destination: `${apiBaseUrl}/health`,
      },
      {
        source: "/api/organizer/:path*",
        destination: `${apiBaseUrl}/organizer/:path*`,
      },
      {
        source: "/api/tables/:path*",
        destination: `${apiBaseUrl}/tables/:path*`,
      },
      {
        source: "/api/events/:path*",
        destination: `${apiBaseUrl}/events/:path*`,
      },
      {
        source: "/media/:path*",
        destination: `${apiBaseUrl}/media/:path*`,
      },
      {
        source: "/telegram/webhook",
        destination: `${botBaseUrl}/telegram/webhook`,
      },
    ];
  },
};

export default nextConfig;
