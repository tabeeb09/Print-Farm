import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
