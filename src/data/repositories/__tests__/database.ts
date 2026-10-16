import { DatabaseSync } from "node:sqlite";
import type { Db } from "../LearningRepository";
export function database(): Db {
  const db = new DatabaseSync(":memory:");
  return {
    execSync: (sql: string) => db.exec(sql),
    runSync: (sql: string, ...params: unknown[]) =>
      db.prepare(sql).run(...(params as never[])),
    getFirstSync: (sql: string, ...params: unknown[]) =>
      db.prepare(sql).get(...(params as never[])) ?? null,
    getAllSync: (sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...(params as never[])),
    withTransactionSync: (fn: () => void) => {
      db.exec("BEGIN");
      try {
        fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as Db;
}
