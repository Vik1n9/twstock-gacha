import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./lib/db/env";

loadEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
