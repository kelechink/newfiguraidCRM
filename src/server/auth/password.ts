import "server-only";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** Hash of a random value, checked when the email is unknown so response time doesn't reveal which accounts exist. */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(randomBytes(32).toString("hex")));
}
