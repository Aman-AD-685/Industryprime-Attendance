import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAbsoluteHttpUrl } from "@/lib/envApi";

export const runtime = "nodejs";

function trimTrailingPathSeparators(s: string): string {
  return s.replace(/[/\\]+$/, "");
}

/**
 * Server-side proxy: browser calls same-origin `/api/*`, this forwards to FastAPI.
 * Reads backend URL at **request time** so Vercel can use `BACKEND_PROXY_TARGET` or
 * `NEXT_PUBLIC_API_URL` without relying on `next.config` rewrites (which bake in build-time env).
 * Only http(s) URLs are accepted — never a Windows file path (avoids broken `fetch` targets).
 */
function backendBase(): string {
  const explicit = process.env.BACKEND_PROXY_TARGET?.trim();
  if (explicit && isAbsoluteHttpUrl(explicit)) {
    return trimTrailingPathSeparators(explicit);
  }
  /** Local `npm run dev` should hit local uvicorn even when NEXT_PUBLIC_API_URL points at production. */
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000";
  }
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub && isAbsoluteHttpUrl(pub)) return trimTrailingPathSeparators(pub);
  return "http://127.0.0.1:8000";
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/** Headers not copied from upstream → browser. `content-encoding` must be dropped: Node fetch decompresses the body but may still surface the origin's Content-Encoding, which causes ERR_CONTENT_DECODING_FAILED in production. */
const UPSTREAM_RESPONSE_SKIP = new Set([...HOP_BY_HOP, "content-encoding"]);

async function proxy(req: NextRequest, segments: string[]) {
  const path = segments.join("/");
  if (!path) {
    return NextResponse.json({ detail: "Missing API path after /api/" }, { status: 404 });
  }
  const src = new URL(req.url);
  const target = `${backendBase()}/${path}${src.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    // Stream request body to upstream to avoid full buffering for multipart uploads.
    if (req.body) {
      init.body = req.body;
      // Node fetch requires `duplex` when body is a stream.
      (init as RequestInit & { duplex: "half" }).duplex = "half";
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream fetch failed";
    if (process.env.NODE_ENV !== "production") {
      console.error("[api proxy] upstream fetch failed", { target, cause: msg });
    } else {
      console.error("[api proxy] upstream fetch failed");
    }
    return NextResponse.json(
      {
        detail:
          "The service is temporarily unavailable. Please try again in a few moments.",
      },
      { status: 502 },
    );
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (UPSTREAM_RESPONSE_SKIP.has(key.toLowerCase())) return;
    resHeaders.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

type Ctx = { params: Promise<{ slug?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { slug = [] } = await ctx.params;
  return proxy(req, slug);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { slug = [] } = await ctx.params;
  return proxy(req, slug);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { slug = [] } = await ctx.params;
  return proxy(req, slug);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { slug = [] } = await ctx.params;
  return proxy(req, slug);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { slug = [] } = await ctx.params;
  return proxy(req, slug);
}
