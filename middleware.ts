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
		const res = NextResponse.next();
		res.headers.set("x-user-id", payload.sub);
		res.headers.set("x-user-email", payload.email);
		const name = payload.name;
		if (name) res.headers.set("x-user-name", name);
		return res;
	} catch {
		const res = NextResponse.redirect(new URL("/login", req.url));
		res.cookies.delete("access_token");
		return res;
	}
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
