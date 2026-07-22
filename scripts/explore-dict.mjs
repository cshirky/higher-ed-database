import { readFileSync } from "fs";
import MDBReader from "mdb-reader";

const path = process.argv[2];
const tableFilter = process.argv[3];
const buffer = readFileSync(path);
const reader = new MDBReader(buffer);

const varTable = reader.getTable("varTable23").getData();
const rows = varTable.filter((r) => r.TableName === tableFilter);
for (const r of rows) {
  console.log(`${r.VarName}\t${r.VarTitle}`);
}
