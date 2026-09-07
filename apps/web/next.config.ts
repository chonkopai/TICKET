import { loadWebEnv } from "@event-platform/config";
import type { NextConfig } from "next";

loadWebEnv();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["sulphate-shown-subtract.ngrok-free.dev"],
  reactStrictMode: true,
  transpilePackages: ["@event-platform/config", "@event-platform/shared-types"],
  async rewrites() {
    return [
      { source: "/api/quick/:path*", destination: "http://localhost:3001/quick/:path*" },
      { source: "/orders/:path*", destination: "http://localhost:3001/orders/:path*" },
      {
        source: "/auth/:path*",
        destination: "http://localhost:3001/auth/:path*",
      },
      {
        source: "/me",
        destination: "http://localhost:3001/me",
      },
      {
        source: "/me/:path*",
        destination: "http://localhost:3001/me/:path*",
      },
      {
        source: "/api/health",
        destination: "http://localhost:3001/health",
      },
      {
        source: "/api/organizer/:path*",
        destination: "http://localhost:3001/organizer/:path*",
      },
      {
        source: "/api/tables/:path*",
        destination: "http://localhost:3001/tables/:path*",
      },
      {
        source: "/api/events/:path*",
        destination: "http://localhost:3001/events/:path*",
      },
      {
        source: "/media/:path*",
        destination: "http://localhost:3001/media/:path*",
      },
      {
        source: "/telegram/webhook",
        destination: "http://localhost:3002/telegram/webhook",
      },
    ];
  },
};

export default nextConfig;
