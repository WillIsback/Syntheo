const KEYCLOAK_BASE =
	process.env.KEYCLOAK_ISSUER ?? `https://${process.env.DOMAIN}/realms/syntheo`;
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "syntheo-app";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? "";

export function getLoginUrl(redirectUri: string, state: string): string {
	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: "openid email profile",
		state,
	});
	return `${KEYCLOAK_BASE}/protocol/openid-connect/auth?${params}`;
}

export async function exchangeCode(
	code: string,
	redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string }> {
	const res = await fetch(`${KEYCLOAK_BASE}/protocol/openid-connect/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			code,
			redirect_uri: redirectUri,
		}),
	});
	if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
	const data = await res.json();
	return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

if (process.env.NODE_ENV !== "test" && !CLIENT_SECRET) {
	console.error(
		"[auth] KEYCLOAK_CLIENT_SECRET is not set — token exchange will fail",
	);
}
