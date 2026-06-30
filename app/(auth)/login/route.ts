import { type NextRequest, NextResponse } from "next/server";
import { getLoginUrl } from "@/lib/auth/keycloak";

export function GET(req: NextRequest) {
	const origin = req.nextUrl.origin;
	const redirectUri = `${origin}/callback`;
	return NextResponse.redirect(getLoginUrl(redirectUri));
}
