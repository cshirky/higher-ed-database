import { readFileSync } from "fs";
import MDBReader from "mdb-reader";

const path = process.argv[2];
const tableNames = process.argv.slice(3);
const buffer = readFileSync(path);
const reader = new MDBReader(buffer);

for (const name of tableNames) {
  const table = reader.getTable(name);
  console.log(`=== ${name} (${table.rowCount} rows) ===`);
  for (const col of table.getColumns()) {
    console.log(`  ${col.name}: ${col.type}`);
  }
}
