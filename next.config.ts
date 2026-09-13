import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray pnpm-lock.yaml in the home directory makes Turbopack guess the
  // wrong workspace root. Pin it to this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
