import { type NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/auth/keycloak";

export async function GET(req: NextRequest) {
	const code = req.nextUrl.searchParams.get("code");
	const state = req.nextUrl.searchParams.get("state");

	if (!code)
		return NextResponse.redirect(
			new URL("/login?error=missing_code", req.nextUrl.origin),
		);

	// Validate OIDC state to prevent CSRF
	const storedState = req.cookies.get("oidc_state")?.value;
	if (!state || !storedState || state !== storedState) {
		return NextResponse.redirect(
			new URL("/login?error=invalid_state", req.nextUrl.origin),
		);
	}

	const pkceVerifier = req.cookies.get("pkce_verifier")?.value;
	if (!pkceVerifier) {
		return NextResponse.redirect(
			new URL("/login?error=missing_verifier", req.nextUrl.origin),
		);
	}

	const origin = req.nextUrl.origin;
	const redirectUri = `${origin}/callback`;

	try {
		const { accessToken, refreshToken } = await exchangeCode(code, redirectUri, pkceVerifier);
		const secure = process.env.NODE_ENV === "production";
		const res = NextResponse.redirect(new URL("/sessions", origin));
		res.cookies.set("access_token", accessToken, {
			httpOnly: true,
			secure,
			sameSite: "lax",
			maxAge: 3600,
			path: "/",
		});
		res.cookies.set("refresh_token", refreshToken, {
			httpOnly: true,
			secure,
			sameSite: "lax",
			maxAge: 86400 * 30,
			path: "/",
		});
		res.cookies.delete("oidc_state");
		res.cookies.delete("pkce_verifier");
		return res;
	} catch {
		return NextResponse.redirect(
			new URL("/login?error=auth_failed", req.nextUrl.origin),
		);
	}
}
