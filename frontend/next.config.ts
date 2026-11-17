import type { NextConfig } from "next";










const BACKEND_ORIGIN =
    process.env.BACKEND_PROXY_ORIGIN ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:8000";

const nextConfig: NextConfig = {

  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "localhost",
      },
    ],
  },
  async rewrites() {
    return [



      {
        source: "/contents/:path*",
        destination: `${BACKEND_ORIGIN}/contents/:path*`,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;