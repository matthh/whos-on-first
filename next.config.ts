import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    BUILD_TIMESTAMP: new Date().toISOString(),
  },
};

export default nextConfig;
