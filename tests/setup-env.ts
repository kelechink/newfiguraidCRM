// Integration tests run against a dedicated database, never the dev one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://figuraid:figuraid@localhost:5432/figuraid_it2";
process.env.FIELD_ENCRYPTION_KEYS ??= `v1:${Buffer.alloc(32, 7).toString("base64")}`;
process.env.FIELD_ENCRYPTION_ACTIVE ??= "v1";
process.env.NEXTAUTH_SECRET ??= "test-secret-not-for-production";
