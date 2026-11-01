import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface AdminSession {
  readonly userId: string;
  readonly username: string;
  readonly role: "OWNER" | "OPERATOR";
}

export interface LoginResult {
  readonly success: boolean;
  readonly session?: AdminSession;
  readonly error?: string;
}

/**
 * Verifies a username/password pair against the admin_user table.
 * Returns the session on success, an error message on failure.
 */
export async function loginAdmin(
  db: Database,
  username: string,
  password: string,
): Promise<LoginResult> {
  const rows = await db
    .select()
    .from(schema.adminUser)
    .where(eq(schema.adminUser.username, username))
    .limit(1);

  const user = rows[0];
  if (!user?.active) {
    return { success: false, error: "Usuario o contraseña incorrectos." };
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    return { success: false, error: "Usuario o contraseña incorrectos." };
  }

  return {
    success: true,
    session: {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
  };
}

/**
 * Creates a new admin user with a hashed password. Used for seeding and
 * by the owner to create operators.
 */
export async function createAdminUser(
  db: Database,
  username: string,
  password: string,
  role: "OWNER" | "OPERATOR",
): Promise<string> {
  const passwordHash = await argon2.hash(password);
  const rows = await db
    .insert(schema.adminUser)
    .values({ username, passwordHash, role })
    .returning({ id: schema.adminUser.id });
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create admin user");
  }
  return id;
}
