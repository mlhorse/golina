import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
export type Row = Record<string, any>;
export type DB = DatabaseSync;
export function openDb(
  path = process.env.DATABASE_PATH || "./data/golina.sqlite",
) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;",
  );
  const found = db
    .prepare("SELECT name FROM sqlite_master WHERE name='migrations'")
    .get();
  if (!found)
    db.exec(
      `BEGIN IMMEDIATE;${readFileSync(new URL("../migrations/001_initial.sql", import.meta.url), "utf8")}COMMIT;`,
    );
  return db;
}
export function one(db: DB, sql: string, ...params: any[]): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined;
}
export function all(db: DB, sql: string, ...params: any[]): Row[] {
  return db.prepare(sql).all(...params) as Row[];
}
export function run(db: DB, sql: string, ...params: any[]) {
  return db.prepare(sql).run(...params);
}
export function transaction<T>(db: DB, f: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = f();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function audit(db: DB, actor: string, action: string, payload: unknown) {
  const previous =
    one(db, "SELECT hash FROM audit ORDER BY seq DESC LIMIT 1")?.hash ||
    "GENESIS";
  const at = new Date().toISOString(),
    body = JSON.stringify(payload);
  const hash = createHash("sha256")
    .update(JSON.stringify([previous, actor, action, body, at]))
    .digest("hex");
  run(
    db,
    "INSERT INTO audit(actor,action,payload,at,previous_hash,hash) VALUES(?,?,?,?,?,?)",
    actor,
    action,
    body,
    at,
    previous,
    hash,
  );
}
export function event(
  db: DB,
  kind: string,
  voteId: string | null,
  payload: unknown,
) {
  run(
    db,
    "INSERT INTO events(event_id,kind,vote_id,payload,at) VALUES(?,?,?,?,?)",
    randomUUID(),
    kind,
    voteId,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}
export function seed(db: DB, password: string) {
  if (password.length < 12)
    throw new Error("DEMO_PASSWORD musi mieć co najmniej 12 znaków.");
  if (one(db, "SELECT id FROM users LIMIT 1"))
    throw new Error("Baza zawiera już konta. Seed nie nadpisuje danych.");
  transaction(db, () => {
    for (const role of ["admin", "production", "display", "bridge", "graphics"])
      run(
        db,
        "INSERT INTO users VALUES(?,?,?,?,?)",
        role,
        role,
        (
          {
            admin: "Administrator",
            production: "Realizator",
            display: "Rzutnik",
            bridge: "vMix Bridge",
            graphics: "Grafika vMix",
          } as Row
        )[role],
        role,
        hashPassword(password),
      );
    for (let i = 1; i <= 15; i++) {
      const id = `radny${String(i).padStart(2, "0")}`;
      run(
        db,
        "INSERT INTO users VALUES(?,?,?,?,?)",
        id,
        id,
        `Radny demonstracyjny ${String(i).padStart(2, "0")}`,
        "councillor",
        hashPassword(password),
      );
    }
    run(
      db,
      "INSERT INTO sessions(id,title,number,date,place,statutory) VALUES(?,?,?,?,?,?)",
      "demo",
      "Sesja demonstracyjna Rady Miejskiej",
      "DEMO / 01",
      new Date().toISOString().slice(0, 10),
      "Golina · środowisko demonstracyjne",
      15,
    );
    [
      "Otwarcie sesji i stwierdzenie kworum",
      "Przedstawienie porządku obrad",
      "Przyjęcie porządku obrad",
      "Przyjęcie protokołu poprzedniej sesji",
      "Informacja o działalności międzysesyjnej",
      "Rozpatrzenie projektów uchwał",
      "Wolne wnioski i informacje",
      "Zakończenie sesji",
    ].forEach((title, i) =>
      run(
        db,
        "INSERT INTO agenda VALUES(?,?,?,?)",
        `agenda-${i + 1}`,
        "demo",
        i + 1,
        title,
      ),
    );
    run(
      db,
      "UPDATE sessions SET active_agenda=? WHERE id=?",
      "agenda-1",
      "demo",
    );
    audit(db, "system", "DEMO_SEEDED", { fictional: true });
  });
}
