import { execSync } from "node:child_process";

// Bring the test database up to the latest migration before any test runs.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://figuraid:figuraid@localhost:5432/figuraid_it2";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
