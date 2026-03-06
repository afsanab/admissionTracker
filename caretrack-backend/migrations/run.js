/**
 * Migration runner.
 * Applies all SQL files in /migrations in order.
 * Tracks applied migrations in a `migrations` table.
 *
 * Usage: node migrations/run.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,
});

async function run() {
  const client = await pool.connect();
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get list of already-applied migrations
    const applied = await client.query("SELECT filename FROM migrations");
    const appliedSet = new Set(applied.rows.map(r => r.filename));

    // Find all .sql files in this directory, sorted by name
    const migDir = path.join(__dirname);
    const files = fs.readdirSync(migDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[skip] ${file} (already applied)`);
        continue;
      }

      console.log(`[apply] ${file}...`);
      const sql = fs.readFileSync(path.join(migDir, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[done]  ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[fail]  ${file}:`, err.message);
        process.exit(1);
      }
    }

    console.log("\nAll migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
