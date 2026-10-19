import { openDb, seed } from "./db.ts";
const password = process.env.DEMO_PASSWORD || "";
const db = openDb();
try {
  seed(db, password);
  console.log(
    "Utworzono DEMO: admin, production, display, graphics, bridge, radny01–radny15. Hasło pochodzi z DEMO_PASSWORD.",
  );
} finally {
  db.close();
}
