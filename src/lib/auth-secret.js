const DEVELOPMENT_FALLBACK_SECRET = "syntheo-dev-auth-secret";

export const resolveAuthSecret = (env = process.env) => {
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is not set.");
  }

  return DEVELOPMENT_FALLBACK_SECRET;
};
