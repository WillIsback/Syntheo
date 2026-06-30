import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyJwt } from "../jwt";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("verifyJwt", () => {
	it("accepts a valid RS256 JWT", async () => {
		const { privateKey, publicKey } = await generateKeyPair("RS256");
		const token = await new SignJWT({ email: "a@b.com", name: "Test User" })
			.setProtectedHeader({ alg: "RS256" })
			.setSubject("user-uuid")
			.setIssuer("https://example.com/realms/syntheo")
			.setAudience("syntheo-app")
			.setExpirationTime("1h")
			.sign(privateKey);

		// inject a mock JWKS that returns our test public key
		// jose v6 checks response.status === 200, not response.ok
		vi.stubGlobal("fetch", async () => ({
			status: 200,
			json: async () => ({
				keys: [
					{
						...(await exportJWK(publicKey)),
						use: "sig",
						alg: "RS256",
						kid: "test",
					},
				],
			}),
		}));

		const payload = await verifyJwt(token);
		expect(payload.sub).toBe("user-uuid");
		expect(payload.email).toBe("a@b.com");
	});

	it("rejects an expired token", async () => {
		const { privateKey } = await generateKeyPair("RS256");
		const token = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256" })
			.setSubject("user-uuid")
			.setIssuer("https://example.com/realms/syntheo")
			.setAudience("syntheo-app")
			.setExpirationTime("-1s")
			.sign(privateKey);

		await expect(verifyJwt(token)).rejects.toThrow();
	});
});
