declare module "cloudflare:workers" {
  export interface Env {
    DB: D1Database;
    CRON_SECRET?: string;
    VINEXT_KV_CACHE?: KVNamespace;
    [key: string]: unknown;
  }
  export const env: Env;
}
