import type { AppType } from "@parking/api";
import { hc, type InferResponseType } from "hono/client";

/**
 * Typed client over the API routes. Request and response shapes come from the server definition.
 * The custom header is the second CSRF layer next to the SameSite cookie (ADR-0008).
 */
export const api = hc<AppType>("/", { headers: { "X-Requested-With": "parking-web" } });

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

async function okJson<T>(pending: Promise<ResponseLike>): Promise<T> {
  const res = await pending;
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  throw new ApiError(
    res.status,
    body.code ?? "request_failed",
    body.message ?? `HTTP ${res.status}`,
  );
}

export type SessionUser = InferResponseType<typeof api.api.auth.me.$get, 200>["user"];
export type DevUser = InferResponseType<
  (typeof api.api.auth)["dev-users"]["$get"],
  200
>["users"][number];
export type ResidentStatus = InferResponseType<typeof api.api.resident.status.$get, 200>;
export type CycleSummary = InferResponseType<
  typeof api.api.admin.cycles.$get,
  200
>["cycles"][number];
export type CycleDetail = InferResponseType<(typeof api.api.admin.cycles)[":id"]["$get"], 200>;
export type Spot = InferResponseType<typeof api.api.admin.spots.$get, 200>["spots"][number];

export const auth = {
  me: () => okJson<{ user: SessionUser }>(api.api.auth.me.$get()).then((r) => r.user),
  devUsers: () =>
    okJson<{ users: DevUser[] }>(api.api.auth["dev-users"].$get()).then((r) => r.users),
  login: (email: string) =>
    okJson<{ user: SessionUser }>(api.api.auth.login.$post({ json: { email } })).then(
      (r) => r.user,
    ),
  logout: async () => {
    const res = await api.api.auth.logout.$post();
    if (!res.ok) throw new ApiError(res.status, "logout_failed", "Could not sign out");
  },
};

export const resident = {
  status: () => okJson<ResidentStatus>(api.api.resident.status.$get()),
  register: () => okJson<{ registrationId: string }>(api.api.resident.register.$post()),
};

export const admin = {
  cycles: () =>
    okJson<{ cycles: CycleSummary[] }>(api.api.admin.cycles.$get()).then((r) => r.cycles),
  cycle: (id: string) => okJson<CycleDetail>(api.api.admin.cycles[":id"].$get({ param: { id } })),
  createCycle: (period: { startsOn: string; endsOn: string }) =>
    okJson<{ cycle: CycleSummary }>(api.api.admin.cycles.$post({ json: period })),
  draw: (id: string) =>
    okJson<{ allocations: number; entrants: number; spots: number }>(
      api.api.admin.cycles[":id"].draw.$post({ param: { id } }),
    ),
  spots: () => okJson<{ spots: Spot[] }>(api.api.admin.spots.$get()).then((r) => r.spots),
  createSpot: (label: string) =>
    okJson<{ spot: Spot }>(api.api.admin.spots.$post({ json: { label } })),
  setSpotActive: (id: string, isActive: boolean) =>
    okJson<{ spot: Spot }>(
      api.api.admin.spots[":id"].$patch({ param: { id }, json: { isActive } }),
    ),
};
