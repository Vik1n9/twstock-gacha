import handler from "vinext/server/fetch-handler";

// 自訂 worker entry：re-export vinext 的 fetch handler，並掛上
// Cloudflare Cron Triggers 用的 scheduled()。
// scheduled 內部直接以 /api/cron/snapshot 走完授權與快照流程，
// 該 route 仍可手動呼叫（Bearer CRON_SECRET）。
// 型別（Env／ScheduledController／ExecutionContext）來自 worker-configuration.d.ts，
// 以 npm run cf-typegen 產生，不要手寫。
const worker = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return handler.fetch(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const req = new Request("https://internal/api/cron/snapshot", {
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    const res = await handler.fetch(req, env, ctx);
    const body = await res.text();
    console.log(`[scheduled cron=${controller.cron}] /api/cron/snapshot → ${res.status}`);
    if (res.status >= 400) {
      throw new Error(`快照 cron 失敗（${res.status}）：${body.slice(0, 500)}`);
    }
  },
};

export default worker;
