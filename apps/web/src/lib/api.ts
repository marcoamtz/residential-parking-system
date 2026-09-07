import type { AppType } from "@parking/api";
import { hc } from "hono/client";

/** Typed client over the API routes. Request and response shapes come from the server definition. */
export const api = hc<AppType>("/");
