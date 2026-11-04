import { createDatabase } from "./client.js";
import { createAdminUser } from "../auth/admin-auth.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const handle = createDatabase(databaseUrl, 2);
try {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin";
  const role = (process.env.ADMIN_ROLE === "OPERATOR" ? "OPERATOR" : "OWNER") as "OWNER" | "OPERATOR";

  try {
    const id = await createAdminUser(handle.db, username, password, role);
    console.log(`Admin user created: ${username} (${role}) id=${id}`);
  } catch (err) {
    console.log(`Admin user '${username}' may already exist: ${(err as Error).message}`);
  }
  console.log(`Credentials -> username: ${username} / password: ${password}`);
} finally {
  await handle.close();
}