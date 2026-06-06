import type { NextConfig } from "next";

/**
 * `/api/*` is proxied at request time by `app/api/[[...slug]]/route.ts`
 * using `BACKEND_PROXY_TARGET` or `NEXT_PUBLIC_API_URL` (see `.env.example`).
 *
 * PWA: `next-pwa` requires Webpack for the service worker build (`next build --webpack`).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  buildExcludes: [/middleware-manifest\.json$/],
  /** Never cache auth pages — stale SW caused production login to hang on "Logging in…". */
  publicExcludes: ["!login", "!signup"],
});

const nextConfig: NextConfig = {};

export default withPWA(nextConfig);
