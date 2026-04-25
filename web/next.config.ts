import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@nodeui": path.resolve("./lib/nodeui"),
    },
  },
  webpack(config) {
    config.resolve.alias["@nodeui"] = path.resolve("./lib/nodeui");
    return config;
  },
};

export default nextConfig;
