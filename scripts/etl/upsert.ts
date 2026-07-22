import { sql, type Table } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";

/** Builds an onConflictDoUpdate `set` object that writes every non-key column from `excluded`. */
export function conflictUpdateSet<T extends Table>(table: T, keyColumns: string[]) {
  const columns = getTableColumns(table);
  const set: Record<string, ReturnType<typeof sql>> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (keyColumns.includes(key)) continue;
    set[key] = sql.raw(`excluded.${column.name}`);
  }
  return set;
}

/** null out standard IPEDS missing-data sentinel codes (-1..-9) without touching legitimate negative values (deficits, longitude). */
export function cleanNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return null;
  if (n < 0 && n > -10) return null;
  return n;
}

export function cleanInt(v: unknown): number | null {
  const n = cleanNum(v);
  return n === null ? null : Math.round(n);
}

export async function batchedUpsert<T extends Table>(
  db: { insert: (t: T) => any },
  table: T,
  rows: Record<string, unknown>[],
  keyColumns: string[],
  batchSize = 500,
) {
  if (rows.length === 0) return;
  const setClause = conflictUpdateSet(table, keyColumns);
  const keyColumnRefs = keyColumns.map((k) => (getTableColumns(table) as any)[k]);
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await db
      .insert(table)
      .values(chunk)
      .onConflictDoUpdate({ target: keyColumnRefs, set: setClause });
  }
}
