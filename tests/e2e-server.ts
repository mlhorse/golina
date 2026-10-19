import { openDb, seed } from "../src/db.ts";
import { makeServer } from "../src/server.ts";
const db = openDb(":memory:");
seed(db, "Browser-test-only!");
makeServer(db).listen(3101, "127.0.0.1");
