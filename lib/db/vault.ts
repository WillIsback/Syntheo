const VAULT_ADDR = process.env.VAULT_ADDR ?? "http://vault:8200";
const VAULT_ROLE_ID = process.env.VAULT_APP_ROLE_ID ?? "";
const VAULT_SECRET_ID = process.env.VAULT_APP_SECRET_ID ?? "";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getVaultToken(): Promise<string> {
	if (cachedToken && Date.now() < cachedToken.expiresAt)
		return cachedToken.token;
	const res = await fetch(`${VAULT_ADDR}/v1/auth/approle/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			role_id: VAULT_ROLE_ID,
			secret_id: VAULT_SECRET_ID,
		}),
	});
	if (!res.ok) throw new Error(`Vault login failed: ${res.status}`);
	const data = await res.json();
	cachedToken = {
		token: data.auth.client_token,
		expiresAt: Date.now() + (data.auth.lease_duration - 60) * 1000,
	};
	return cachedToken.token;
}

export async function getEncryptionKey(): Promise<string> {
	const token = await getVaultToken();
	const res = await fetch(`${VAULT_ADDR}/v1/secret/data/syntheo/enc_key`, {
		headers: { "X-Vault-Token": token },
	});
	if (!res.ok) throw new Error(`Vault key fetch failed: ${res.status}`);
	const data = await res.json();
	return data.data.data.value as string;
}
