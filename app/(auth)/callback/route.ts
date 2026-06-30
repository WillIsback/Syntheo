import { type NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/auth/keycloak";

export async function GET(req: NextRequest) {
	const code = req.nextUrl.searchParams.get("code");
	if (!code)
		return NextResponse.redirect(new URL("/login", req.nextUrl.origin));

	const origin = req.nextUrl.origin;
	const redirectUri = `${origin}/callback`;

	const { accessToken, refreshToken } = await exchangeCode(code, redirectUri);

	const res = NextResponse.redirect(new URL("/sessions", origin));
	res.cookies.set("access_token", accessToken, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: 3600,
		path: "/",
	});
	res.cookies.set("refresh_token", refreshToken, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: 86400 * 30,
		path: "/",
	});
	return res;
}
