import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@nodeui": path.resolve("./lib/nodeui"),
      // @0glabs/0g-serving-broker imports these Node built-ins at module level
      // but never calls them in browser inference flows — stub them out.
      "child_process": "./lib/stubs/child_process.js",
      "fs": "./lib/stubs/fs.js",
      "fs/promises": "./lib/stubs/fs.js",
    },
  },
  webpack(config) {
    config.resolve.alias["@nodeui"] = path.resolve("./lib/nodeui");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      child_process: false,
      fs: false,
    };
    return config;
  },
};

export default nextConfig;
