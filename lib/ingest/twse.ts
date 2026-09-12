const MI_INDEX_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX";

export interface DailyCloseRow {
  stockCode: string;
  close: number;
  volume: number | null; // 成交股數
}

export interface FetchDailyResult {
  date: string; // YYYY-MM-DD
  rows: DailyCloseRow[];
}

function num(raw: string): number | null {
  const s = raw.replace(/,/g, "").trim();
  if (s === "" || s === "--" || s === "X" || s === "N/A") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// 剝除漲跌欄的 HTML 標籤（+/-）
export function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").trim();
}

interface MiIndexTable {
  title?: string;
  fields?: string[];
  data?: string[][];
}

interface MiIndexResponse {
  stat?: string;
  date?: string;
  tables?: MiIndexTable[];
}

async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        cache: "no-store",
      });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw lastErr;
}

// 取單一交易日全市場收盤。回 null 表示該日無資料（假日/尚未公布）
export async function fetchDailyClose(
  dateYYYYMMDD: string,
): Promise<FetchDailyResult | null> {
  const url = `${MI_INDEX_URL}?response=json&date=${dateYYYYMMDD}&type=ALL`;
  const res = await fetchWithRetry(url);
  const body = (await res.json()) as MiIndexResponse;

  if (body.stat !== "OK" || !body.tables) return null;

  const table = body.tables.find((t) => t.fields?.[0] === "證券代號");
  if (!table?.data) return null;

  const rows: DailyCloseRow[] = [];
  for (const r of table.data) {
    const code = (r[0] ?? "").trim();
    const close = num(r[8] ?? "");
    if (!code || close === null) continue; // 收盤價 '--' 為零股未成交等
    const volume = num(r[2] ?? "");
    rows.push({ stockCode: code, close, volume });
  }

  const date = `${dateYYYYMMDD.slice(0, 4)}-${dateYYYYMMDD.slice(4, 6)}-${dateYYYYMMDD.slice(6, 8)}`;
  return { date, rows };
}

export function ymdOf(d: Date): string {
  return (
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, "0")}` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}
