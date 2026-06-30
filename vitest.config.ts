import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		env: {
			KEYCLOAK_ISSUER: "https://example.com/realms/syntheo",
			KEYCLOAK_AUDIENCE: "syntheo-app",
		},
	},
	resolve: {
		alias: { "@": resolve(__dirname, ".") },
	},
});
