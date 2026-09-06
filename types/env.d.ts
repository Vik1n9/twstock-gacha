// wrangler types（npm run cf-typegen）只從 wrangler.jsonc 與 .dev.vars 推導綁定。
// CRON_SECRET 是以 `wrangler secret put CRON_SECRET` 設定的機密，兩者都不含，
// 故在此補宣告；其餘綁定（DB／VINEXT_KV_CACHE／ASSETS…）一律以產生的
// worker-configuration.d.ts 為準，不要在這裡手寫。
// 全域 Env 與 Cloudflare.Env 都要補：worker/index.ts 用前者，
// cloudflare:workers 的 env 用後者。
interface Env {
  CRON_SECRET?: string;
}

declare namespace Cloudflare {
  interface Env {
    CRON_SECRET?: string;
  }
}
