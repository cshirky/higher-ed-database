import { readFileSync } from "fs";
import MDBReader from "mdb-reader";
const path = process.argv[2];
const filter = process.argv[3].toLowerCase();
const reader = new MDBReader(readFileSync(path));
const varTable = reader.getTable("varTable23").getData();
const names = [...new Set(varTable.map((r) => r.TableName))];
const matches = names.filter((n) => n.toLowerCase().includes(filter));
console.log("matching table names:", matches);
for (const m of matches) {
  console.log(`\n=== ${m} ===`);
  const rows = varTable.filter((r) => r.TableName === m);
  for (const r of rows) console.log(`${r.VarName}\t${r.VarTitle}`);
}
