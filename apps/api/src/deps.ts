import type { Db } from "@parking/db";
import type { Cache } from "./cache";

export type Role = "resident" | "admin";

/** Claims carried in the session token. Resident routes trust `residentId` from here only. */
export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  buildingId: string;
  residentId: string | null;
}

export interface Deps {
  db: Db;
  cache: Cache;
  jwtSecret: string;
  cookieSecure: boolean;
  mockAuth: boolean;
  now: () => Date;
}

export type AppEnv = { Variables: { user: SessionUser } };

/** ISO date (YYYY-MM-DD) in UTC. Building-local time zones are a documented future concern. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
