import { loadDotenv } from "./env";

/**
 * Side-effect module, imported first by every entrypoint. ES modules evaluate imports in order,
 * so the root `.env` is loaded before any module that reads `process.env` at evaluation time
 * (the pino logger reads LOG_LEVEL when `observability.ts` is first imported).
 */
loadDotenv();
