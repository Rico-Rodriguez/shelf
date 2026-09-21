import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "plaid"],
};

export default nextConfig;
