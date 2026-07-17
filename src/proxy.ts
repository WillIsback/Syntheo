import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Keep backward compatibility for legacy links after the auth/app-route merge.
 */
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/home/:path*", "/about/:path*"],
};
