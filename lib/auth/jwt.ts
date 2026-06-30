import { createRemoteJWKSet, jwtVerify } from "jose";

const KEYCLOAK_ISSUER =
	process.env.KEYCLOAK_ISSUER ?? `https://${process.env.DOMAIN}/realms/syntheo`;
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE ?? "syntheo-app";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
	if (!jwks) {
		jwks = createRemoteJWKSet(
			new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`),
		);
	}
	return jwks;
}

export async function verifyJwt(
	token: string,
): Promise<{ sub: string; email: string; name: string }> {
	const { payload } = await jwtVerify(token, getJwks(), {
		issuer: KEYCLOAK_ISSUER,
		audience: KEYCLOAK_AUDIENCE,
	});
	return {
		sub: payload.sub as string,
		email: payload.email as string,
		name: (payload.name ?? payload.preferred_username) as string,
	};
}
