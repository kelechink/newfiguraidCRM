// Integration tests run against a dedicated database, never the dev one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://figuraid:figuraid@localhost:5432/figuraid_it";
