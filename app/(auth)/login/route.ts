import { type NextRequest, NextResponse } from "next/server";
import { getLoginUrl } from "@/lib/auth/keycloak";

export function GET(req: NextRequest) {
	const origin = req.nextUrl.origin;
	const redirectUri = `${origin}/callback`;

	// Generate cryptographically random state for CSRF protection
	const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const res = NextResponse.redirect(getLoginUrl(redirectUri, state));
	res.cookies.set("oidc_state", state, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: 600, // 10 minutes — code must be exchanged within this window
		path: "/",
	});
	return res;
}
