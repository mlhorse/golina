import { backup } from "node:sqlite";
import { openDb } from "./db.ts";
import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
const target = process.argv[2];
if (!target)
  throw new Error("Użycie: npm run backup -- ścieżka/nowa-kopia.sqlite");
if (existsSync(target))
  throw new Error("Plik docelowy już istnieje. Kopia nie nadpisuje plików.");
mkdirSync(dirname(resolve(target)), { recursive: true });
const db = openDb();
try {
  await backup(db, resolve(target));
  console.log(
    "Utworzono spójną kopię SQLite. Przechowuj ją zaszyfrowaną poza laptopem.",
  );
} finally {
  db.close();
}
