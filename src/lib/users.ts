import { eq } from "drizzle-orm";
import { appUser } from "@/db/schema";
import { getDb } from "@/lib/db";
import {
  type AppRole,
  type UserSelect,
  UserSelectSchema,
} from "@/schemas/postgresql.server.schema";

export type AppUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  passwordHash: string;
  role: AppRole;
  createdAt: string;
};

const joinDisplayName = (firstName: string, lastName: string): string =>
  `${firstName} ${lastName}`.trim();

const mapRowToUser = (row: UserSelect): AppUser => ({
  id: row.uid,
  email: row.email,
  firstName: row.firstname,
  lastName: row.lastname,
  displayName: joinDisplayName(row.firstname, row.lastname),
  passwordHash: row.password_hash,
  role: row.role,
  createdAt: row.created_at,
});

const toIsoDatetime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Invalid timestamp returned by database: ${value}`);
  }
  return parsed.toISOString();
};

export const findUserByEmail = async (
  email: string,
): Promise<AppUser | null> => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.email, email.toLowerCase()))
    .limit(1);

  if (!row) {
    return null;
  }

  return mapRowToUser(
    UserSelectSchema.parse({
      uid: row.uid,
      email: row.email,
      firstname: row.firstname,
      lastname: row.lastname,
      password_hash: row.passwordHash,
      role: row.role,
      created_at: toIsoDatetime(row.createdAt),
      updated_at: toIsoDatetime(row.updatedAt),
    }),
  );
};
