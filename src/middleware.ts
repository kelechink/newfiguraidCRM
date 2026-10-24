import { NextResponse, type NextRequest } from "next/server";

// Strict nonce-based CSP on every page (Security #5, #18). Next applies the
// nonce to its own scripts by reading it from the request header.
export function middleware(req: NextRequest) {
  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // inline style attributes (drag transforms); no inline scripts
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  headers.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);

  // Cheap gate: no session cookie → sign in. The real check (revocation, idle
  // timeout, permissions) happens server-side in getCtx() on every request.
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("__Secure-next-auth.session-token") || req.cookies.has("next-auth.session-token");
  if (!hasSession && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// Reachable without signing in. Each of these does its own verification
// (webhook signatures, single-use tokens, rate limits, CAPTCHA).
const PUBLIC_PREFIXES = [
  "/login",
  "/accept-invite/",
  "/reset-password",
  "/forgot-password",
  "/privacy",
  "/verify/",
  "/f/",
  "/sign/",
  "/csat/",
  "/r/",
  "/l/",
  "/unsubscribe",
  "/api/webhooks/",
  "/api/widget/",
  "/api/public/",
  "/widget.js",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

export const config = {
  // Everything except Next internals, static files and the NextAuth endpoints.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
