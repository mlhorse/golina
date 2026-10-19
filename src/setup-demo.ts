import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { openDb, one, seed } from "./db.ts";
let password = process.env.DEMO_PASSWORD;
if (!existsSync(".env")) {
  password = password || randomBytes(18).toString("base64url");
  writeFileSync(
    ".env",
    `HOST=127.0.0.1\nPORT=3000\nDATABASE_PATH=./data/golina.sqlite\nSECURE_COOKIE=false\nDEMO_PASSWORD=${password}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Utworzono lokalny plik .env z losowym hasłem demonstracyjnym. Nie udostępniaj go w repozytorium.",
  );
}
const db = openDb();
try {
  if (one(db, "SELECT id FROM users LIMIT 1"))
    console.log("Konta już istnieją — zachowano dane i hasła.");
  else {
    if (!password)
      throw new Error(
        "Ustaw DEMO_PASSWORD (co najmniej 12 znaków) w istniejącym .env.",
      );
    seed(db, password);
    console.log(
      "Utworzono konta: admin, production, display, graphics, bridge, radny01–radny15. Hasło: pole DEMO_PASSWORD w lokalnym .env.",
    );
  }
} finally {
  db.close();
}
