import "server-only";
import { PrismaClient } from "@prisma/client";

// Only src/server/** may import this. Pages and components call module
// services, which apply permission scopes to every query.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
