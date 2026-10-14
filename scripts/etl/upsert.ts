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

// IPEDS marks a missing value two ways, depending on the table. Checked
// against every year 2010-2024 of the files this project loads:
//   - HD, the institution directory, uses negative codes in its categorical
//     columns: -1 not reported, -2 not applicable, -3 not available.
//   - Every other table read here (ADM/IC, DRVADM, DRVEF, DRVC, DRVGR, DRVF,
//     DRVIC, DRVHR, SFA) uses a real null, and a negative number in them is a
//     real value — a negative equity ratio or a deficit in DRVF, for instance.
// So the codes are stripped from HD only. Treating small negatives as codes
// everywhere used to discard every mildly negative equity ratio while keeping
// the extreme ones.

/** A number, or null for null, undefined or anything that does not parse. Negative values are kept. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

/** `num`, rounded to a whole number. */
export function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

/** A categorical code from HD: null for its negative "not reported / not applicable / not available" codes. */
export function hdCode(v: unknown): number | null {
  const n = int(v);
  return n === null || n < 0 ? null : n;
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
