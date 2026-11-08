import type { NextConfig } from "next";
import path from "node:path";
const connected = process.env.NEXT_PUBLIC_FS_CONNECTED === "true";
const config: NextConfig = {
  devIndicators: false,
  output: connected ? undefined : "export", trailingSlash: !connected, images: { unoptimized: true },
  turbopack: { root: path.resolve(__dirname, "../..") },
  ...(connected ? { async rewrites() { return [{ source: "/api/:path*", destination: "http://127.0.0.1:4000/api/:path*" }]; } } : {})
};
export default config;
