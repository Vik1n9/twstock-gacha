declare global {
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    all(): Promise<{ results: Record<string, unknown>[]; success: boolean; meta: Record<string, unknown> }>;
    run(): Promise<{ results: Record<string, unknown>[]; success: boolean; meta: Record<string, unknown> }>;
    raw(): Promise<unknown[]>;
  }
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
    exec(query: string): Promise<unknown>;
  }
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  }
}

export {};
