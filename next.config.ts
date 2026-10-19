import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "52mb" } },
  serverExternalPackages: ["tesseract.js"],
};
export default nextConfig;
