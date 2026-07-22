import { readFileSync } from "fs";
import MDBReader from "mdb-reader";

const path = process.argv[2];
const buffer = readFileSync(path);
const reader = new MDBReader(buffer);
const tables = reader.getTableNames();
console.log(tables.sort().join("\n"));
