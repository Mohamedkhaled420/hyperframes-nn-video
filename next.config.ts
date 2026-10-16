import type { NextConfig } from "next";

// `output: "standalone"` is for self-hosting (npm run build:selfhost && npm start).
// It must NOT be active on Vercel — Vercel assembles its own output and a
// standalone build there breaks the deployment (404 / serverless mismatch).
const nextConfig: NextConfig = {
  output: process.env.STANDALONE === "1" ? "standalone" : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
