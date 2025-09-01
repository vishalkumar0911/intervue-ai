// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    FASTAPI_URL: process.env.FASTAPI_URL,
    FASTAPI_API_KEY: process.env.FASTAPI_API_KEY, // visible in browser (dev only)
  },
};
export default nextConfig;
