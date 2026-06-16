/**
 * Create the first administrator account.
 *
 * Unlike `seed.js` (dev-only demo data), this script is SAFE TO RUN IN
 * PRODUCTION and exists to bootstrap the very first admin, who can then invite
 * everyone else from the UI. It reuses the app's connection pool, so it honours
 * the same SSL settings as the running server.
 *
 * Usage (env vars, not flags, so the password never lands in shell history):
 *
 *   ADMIN_USERNAME=jane.admin \
 *   ADMIN_PASSWORD='a-long-unique-password' \
 *   ADMIN_FULL_NAME='Jane Admin' \
 *   node migrations/create-admin.js
 *
 * It refuses to overwrite an existing username. To reset an existing user's
 * password, use the in-app admin "reset password" flow instead.
 */

const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const env = require("../src/config");
const { query, shutdown } = require("../src/db/pool");

async function main() {
  const username = (process.env.ADMIN_USERNAME || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  const fullName = (process.env.ADMIN_FULL_NAME || "").trim() || null;

  if (!username) {
    console.error("FATAL: set ADMIN_USERNAME.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("FATAL: set ADMIN_PASSWORD to at least 12 characters.");
    process.exit(1);
  }

  const existing = await query("SELECT 1 FROM users WHERE username = $1", [username]);
  if (existing.rows[0]) {
    console.error(
      `FATAL: a user named "${username}" already exists. ` +
        "Use the in-app admin password-reset flow instead of this script."
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  await query(
    `INSERT INTO users (id, username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, 'admin')`,
    [uuidv4(), username, hash, fullName]
  );

  console.log(`Created admin "${username}". Sign in and invite the rest of your team from the UI.`);
}

main()
  .catch((err) => {
    console.error("create-admin error:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdown();
  });
