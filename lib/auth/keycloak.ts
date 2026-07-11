const KEYCLOAK_BASE =
	process.env.KEYCLOAK_ISSUER ?? `https://${process.env.DOMAIN}/realms/syntheo`;
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "syntheo-app";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? "";

export async function generatePkce(): Promise<{
	verifier: string;
	challenge: string;
}> {
	const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
	const verifier = btoa(String.fromCharCode(...verifierBytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
	const challengeBytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	const challenge = btoa(
		String.fromCharCode(...new Uint8Array(challengeBytes)),
	)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
	return { verifier, challenge };
}

export function getLoginUrl(
	redirectUri: string,
	state: string,
	codeChallenge: string,
): string {
	const params = new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: "code",
		scope: "openid email profile",
		state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});
	return `${KEYCLOAK_BASE}/protocol/openid-connect/auth?${params}`;
}

export async function exchangeCode(
	code: string,
	redirectUri: string,
	codeVerifier: string,
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
			code_verifier: codeVerifier,
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
