import { readFileSync } from "node:fs";
import { join } from "node:path";

// drizzle-kit 與 tsx scripts 不會自動載入 Next 的 .env.local，自行載入
export function loadEnv(): void {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const path = join(process.cwd(), file);
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
