import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["@electric-sql/pglite", "plaid"],
  // Hide the floating Next.js "N" badge so it doesn't sit on the mobile tab bar.
  devIndicators: false,
};

export default nextConfig;
