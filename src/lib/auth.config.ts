import type NextAuth from "next-auth";
import { resolveAuthSecret } from "./auth-secret.js";

/**
 * Edge-safe base config, shared by the full Node config (auth.ts, adds the
 * DB-backed Credentials provider) and the Edge Runtime config (auth-edge.ts,
 * session verification only — no provider, since `pg` can't run on Edge).
 */
// Passed as literal `process.env.X` (not the `env` indirection param) so
// Next.js's Edge Runtime bundler statically detects and inlines these vars —
// this file is imported by the Edge-safe auth-edge.ts too.
export const authConfig = {
  secret: resolveAuthSecret({
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  }),
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.email = token.email ?? "";
        session.user.name = token.name;
        session.user.role =
          (token.role as "admin" | "user" | undefined) ?? "user";
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
} satisfies Parameters<typeof NextAuth>[0];
