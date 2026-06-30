import { type NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/login", "/callback", "/api/health"];

export async function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;
	if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)))
		return NextResponse.next();

	const token = req.cookies.get("access_token")?.value;
	if (!token) return NextResponse.redirect(new URL("/login", req.url));

	try {
		const payload = await verifyJwt(token);
		// Strip inbound spoofable identity headers before setting verified values
		const requestHeaders = new Headers(req.headers);
		requestHeaders.delete("x-user-id");
		requestHeaders.delete("x-user-email");
		requestHeaders.delete("x-user-name");
		requestHeaders.set("x-user-id", payload.sub);
		requestHeaders.set("x-user-email", payload.email ?? "");
		requestHeaders.set("x-user-name", payload.name ?? "");
		return NextResponse.next({ request: { headers: requestHeaders } });
	} catch {
		const res = NextResponse.redirect(new URL("/login", req.url));
		res.cookies.delete("access_token");
		return res;
	}
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
