import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/** Edge-safe `auth()` — reads/verifies the JWT session only, no DB access. */
export const { auth: authEdge } = NextAuth(authConfig);
