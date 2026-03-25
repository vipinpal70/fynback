import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["*"],
  // All workspace packages use "main": "src/index.ts" (TS-first).
  // Turbopack production builds can't resolve .ts files from node_modules
  // without this — they must be transpiled by Next.js itself.
  transpilePackages: [
    '@fynback/db',
    '@fynback/queue',
    '@fynback/redis',
    '@fynback/shared',
    '@fynback/crypto',
  ],
};

export default nextConfig;
