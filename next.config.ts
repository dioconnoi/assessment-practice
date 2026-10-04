import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle (server.js + pruned
  // node_modules) so the Docker image doesn't need the full node_modules
  // tree or the Next.js build toolchain at runtime.
  output: "standalone",
};

export default nextConfig;
