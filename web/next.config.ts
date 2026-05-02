import type { NextConfig } from "next";

/**
 * `/api/*` is proxied at request time by `app/api/[[...slug]]/route.ts`
 * using `BACKEND_PROXY_TARGET` or `NEXT_PUBLIC_API_URL` (see `.env.example`).
 */
const nextConfig: NextConfig = {};

export default nextConfig;
