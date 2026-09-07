import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { z } from "zod";
import type { AppEnv, Deps, Role, SessionUser } from "../deps";
import { HttpError } from "../errors";

const COOKIE = "session";
const TTL_SECONDS = 12 * 60 * 60;

const claims = z.object({
  sub: z.string(),
  email: z.string(),
  role: z.enum(["resident", "admin"]),
  buildingId: z.string(),
  residentId: z.string().nullable(),
});

export async function issueSession(c: Context, deps: Deps, user: SessionUser): Promise<void> {
  const exp = Math.floor(deps.now().getTime() / 1000) + TTL_SECONDS;
  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      buildingId: user.buildingId,
      residentId: user.residentId,
      exp,
    },
    deps.jwtSecret,
  );
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: deps.cookieSecure,
    sameSite: "Strict",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: "/" });
}

export function requireAuth(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, COOKIE);
    if (!token) throw new HttpError(401, "unauthenticated", "Sign in required");
    let payload: unknown;
    try {
      payload = await verify(token, deps.jwtSecret, "HS256");
    } catch {
      throw new HttpError(401, "invalid_session", "Session is invalid or expired");
    }
    const parsed = claims.safeParse(payload);
    if (!parsed.success) throw new HttpError(401, "invalid_session", "Session claims malformed");
    const { sub, ...rest } = parsed.data;
    c.set("user", { id: sub, ...rest });
    await next();
  };
}

export function requireRole(role: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.get("user").role !== role) {
      throw new HttpError(403, "forbidden", `Requires ${role} role`);
    }
    await next();
  };
}

/** Resident identity comes from the session only, never from the request. */
export function residentIdOf(user: SessionUser): string {
  if (!user.residentId) throw new HttpError(403, "not_a_resident", "No resident linked to user");
  return user.residentId;
}
