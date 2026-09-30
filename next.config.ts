import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": [
      "./tests/**/*",
      "./desktop/**/*",
      "./runs/**/*",
      "./config/planner-options.json",
      "./config/planner-options.json.tmp-*",
      "./.env*",
    ],
  },
};

export default nextConfig;
