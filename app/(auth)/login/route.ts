import { type NextRequest, NextResponse } from "next/server";
import { generatePkce, getLoginUrl } from "@/lib/auth/keycloak";

export async function GET(req: NextRequest) {
	const origin = req.nextUrl.origin;
	const redirectUri = `${origin}/callback`;

	// Generate cryptographically random state for CSRF protection
	const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const { verifier, challenge } = await generatePkce();

	const secure = process.env.NODE_ENV === "production";
	const cookieOpts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

	const res = NextResponse.redirect(getLoginUrl(redirectUri, state, challenge));
	res.cookies.set("oidc_state", state, { ...cookieOpts, maxAge: 600 });
	res.cookies.set("pkce_verifier", verifier, { ...cookieOpts, maxAge: 600 });
	return res;
}
