import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  openDb,
  one,
  all,
  run,
  checkPassword,
  hashPassword,
  transaction,
  audit,
  event,
  type DB,
  type Row,
} from "./db.ts";
import {
  Fault,
  requireThat,
  state,
  createVote,
  transition,
  castBallot,
} from "./domain.ts";
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const dummyPassword = hashPassword(randomBytes(32).toString("hex"));
const roles: Record<string, string[]> = {
  admin: ["admin"],
  member: ["councillor"],
  production: ["admin", "production"],
  bridge: ["bridge"],
  graphics: ["graphics"],
};
export function makeServer(db: DB, options: { secure?: boolean } = {}) {
  const streams = new Map<ServerResponse, Row>();
  const attempts = new Map<string, { count: number; until: number }>();
  const connections = new Set<ServerResponse>();
  const send = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  };
  const broadcast = () => {
    for (const [res, actor] of streams) {
      if (actor.expires <= Date.now()) {
        res.end();
        streams.delete(res);
        continue;
      }
      res.write(`event: state\ndata: ${JSON.stringify(state(db, actor))}\n\n`);
    }
  };
  function auth(req: IncomingMessage) {
    const raw = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("golina_session="))
      ?.slice(15);
    if (!raw) return undefined;
    return one(
      db,
      "SELECT u.id,u.name,u.role,u.username,s.csrf,s.expires FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
      tokenHash(raw),
      Date.now(),
    );
  }
  async function body(req: IncomingMessage) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      requireThat(size <= 32768, 413, "Żądanie jest zbyt duże.");
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString() || "{}") as Row;
    } catch {
      throw new Fault(400, "Nieprawidłowy JSON.");
    }
  }
  const server = createServer(async (req, res) => {
    connections.add(res);
    res.on("close", () => connections.delete(res));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        ),
        path = url.pathname;
      const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(
        req.method || "GET",
      );
      if (mutating && req.headers.origin)
        requireThat(
          req.headers.origin ===
            `${options.secure ? "https" : "http"}://${req.headers.host}`,
          403,
          "Niedozwolone pochodzenie żądania.",
        );
      if (path === "/api/health")
        return send(res, 200, {
          ok: one(db, "PRAGMA quick_check")?.quick_check === "ok",
          version: "0.1.0",
          demo: true,
        });
      if (path === "/api/login" && req.method === "POST") {
        const now = Date.now(),
          key = req.socket.remoteAddress || "unknown",
          a = attempts.get(key);
        requireThat(
          !a || a.until < now || a.count < 30,
          429,
          "Zbyt wiele prób. Spróbuj za minutę.",
        );
        if (attempts.size > 10000)
          for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
        attempts.set(key, {
          count: a && a.until > now ? a.count + 1 : 1,
          until: a && a.until > now ? a.until : now + 60000,
        });
        const b = await body(req);
        requireThat(
          typeof b.username === "string" &&
            typeof b.password === "string" &&
            b.password.length <= 256,
          400,
          "Podaj login i hasło.",
        );
        const user = one(
          db,
          "SELECT * FROM users WHERE username=?",
          b.username,
        );
        const valid = checkPassword(
          b.password,
          user?.password || dummyPassword,
        );
        requireThat(user && valid, 401, "Nieprawidłowy login lub hasło.");
        const token = randomBytes(32).toString("hex"),
          csrf = randomBytes(24).toString("hex");
        run(
          db,
          "INSERT INTO auth_sessions VALUES(?,?,?,?)",
          tokenHash(token),
          user.id,
          csrf,
          Date.now() + 12 * 3600000,
        );
        res.setHeader(
          "Set-Cookie",
          `golina_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${options.secure ? "; Secure" : ""}`,
        );
        return send(res, 200, {
          user: {
            id: user.id,
            name: user.name,
            role: user.role,
            username: user.username,
          },
          csrf,
        });
      }
      if (path.startsWith("/api/")) {
        const actor = auth(req);
        requireThat(actor, 401, "Zaloguj się, aby kontynuować.");
        if (mutating)
          requireThat(
            req.headers["x-csrf-token"] === actor.csrf,
            403,
            "Nieprawidłowy token CSRF.",
          );
        const allow = (role: string) =>
          requireThat(roles[role].includes(actor.role), 403, "Brak uprawnień.");
        if (path === "/api/me")
          return send(res, 200, {
            user: {
              id: actor.id,
              name: actor.name,
              username: actor.username,
              role: actor.role,
            },
            csrf: actor.csrf,
          });
        if (path === "/api/logout" && req.method === "POST") {
          const token = req.headers.cookie
            ?.split(";")
            .map((x) => x.trim())
            .find((x) => x.startsWith("golina_session="))
            ?.slice(15);
          run(
            db,
            "DELETE FROM auth_sessions WHERE token=?",
            tokenHash(token || ""),
          );
          for (const [s, u] of streams) if (u.csrf === actor.csrf) s.end();
          res.setHeader(
            "Set-Cookie",
            "golina_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return send(res, 200, { ok: true });
        }
        if (path === "/api/state" && req.method === "GET")
          return send(res, 200, state(db, actor));
        if (path === "/api/events" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            Connection: "keep-alive",
          });
          res.write(
            `event: state\ndata: ${JSON.stringify(state(db, actor))}\n\n`,
          );
          streams.set(res, actor);
          req.on("close", () => streams.delete(res));
          return;
        }
        if (path === "/api/bridge/events" && req.method === "GET") {
          allow("bridge");
          const latest = one(
            db,
            "SELECT * FROM events WHERE kind='VOTE_RESULT_APPROVED' ORDER BY seq DESC LIMIT 1",
          );
          const cursor = one(
            db,
            "SELECT COALESCE(MAX(seq),0) AS n FROM events",
          )!.n;
          const after = Number(url.searchParams.get("after"));
          const prod = one(db, "SELECT * FROM production")!;
          const ready = latest
            ? one(
                db,
                "SELECT * FROM graphics_ready WHERE vote_id=?",
                latest.vote_id,
              )
            : null;
          const valid =
            url.searchParams.has("after") &&
            Number.isSafeInteger(after) &&
            after >= 0 &&
            latest &&
            latest.seq > after &&
            Date.now() - Date.parse(latest.at) < 30000 &&
            prod.mode === "AUTO";
          return send(res, 200, {
            cursor,
            event: valid
              ? {
                  ...latest,
                  payload: JSON.parse(latest.payload),
                  ready:
                    !!ready &&
                    ready.at >= Date.parse(latest.at) &&
                    ready.version === JSON.parse(latest.payload).resultVersion,
                }
              : null,
            production: prod,
          });
        }
        if (path === "/api/results.csv" && req.method === "GET") {
          const rows = all(
            db,
            "SELECT snapshot,approved_at FROM results ORDER BY approved_at",
          );
          const quote = (x: unknown) =>
            '"' +
            String(x)
              .replace(/^[=+@\-\t\r]/, "'$&")
              .replaceAll('"', '""') +
            '"';
          const lines = [["Sesja", "Pytanie", "Radny", "Głos", "Zatwierdzono"]];
          for (const r of rows) {
            const s = JSON.parse(r.snapshot);
            for (const m of s.members)
              lines.push([
                s.sessionNumber,
                s.question,
                m.name,
                m.choice,
                r.approved_at,
              ]);
          }
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="wyniki-golina.csv"',
          });
          res.end(
            "\ufeff" + lines.map((l) => l.map(quote).join(";")).join("\r\n"),
          );
          return;
        }
        if (!mutating) throw new Fault(404, "Nie znaleziono zasobu.");
        const b = await body(req);
        let result: unknown = { ok: true };
        if (path === "/api/sessions") {
          allow("admin");
          requireThat(
            typeof b.title === "string" &&
              b.title.trim().length >= 3 &&
              b.title.length <= 200 &&
              typeof b.number === "string" &&
              b.number.length <= 40 &&
              /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
              Number.isInteger(b.statutory) &&
              b.statutory >= 1 &&
              b.statutory <= 100,
            400,
            "Nieprawidłowe dane sesji.",
          );
          requireThat(
            !one(
              db,
              "SELECT id FROM sessions WHERE status IN ('live','break')",
            ),
            409,
            "Zakończ aktywną sesję przed utworzeniem kolejnej.",
          );
          transaction(db, () => {
            const id = randomBytes(16).toString("hex");
            run(
              db,
              "INSERT INTO sessions(id,title,number,date,place,statutory) VALUES(?,?,?,?,?,?)",
              id,
              b.title,
              b.number,
              b.date,
              String(b.place || "Golina").slice(0, 200),
              b.statutory,
            );
            audit(db, actor.id, "SESSION_CREATED", { id, ...b });
            result = { id };
          });
        } else if (path === "/api/session/control") {
          allow("admin");
          transaction(db, () => {
            const s = one(db, "SELECT * FROM sessions WHERE id=?", b.sessionId);
            requireThat(s, 404, "Nie znaleziono sesji.");
            const statuses: Row = {
              start: "live",
              break: "break",
              resume: "live",
              end: "ended",
            };
            const target = statuses[b.action];
            requireThat(target, 400, "Nieprawidłowa operacja.");
            const allowed: Row = {
              start: ["draft"],
              break: ["live"],
              resume: ["break"],
              end: ["live", "break"],
            };
            requireThat(
              allowed[b.action].includes(s.status),
              409,
              "Nieprawidłowy stan sesji.",
            );
            if (["break", "end"].includes(b.action))
              requireThat(
                !one(
                  db,
                  "SELECT id FROM votes WHERE session_id=? AND status='OPEN'",
                  s.id,
                ),
                409,
                "Najpierw zamknij głosowanie.",
              );
            run(
              db,
              "UPDATE sessions SET status=?,attendance_open=? WHERE id=?",
              target,
              target === "ended" ? 0 : s.attendance_open,
              s.id,
            );
            audit(db, actor.id, "SESSION_CONTROL", {
              id: s.id,
              action: b.action,
            });
            event(db, "SESSION_CHANGED", null, {
              sessionId: s.id,
              status: target,
            });
          });
        } else if (path === "/api/agenda") {
          allow("admin");
          requireThat(
            typeof b.title === "string" &&
              b.title.trim().length >= 3 &&
              b.title.length <= 2000,
            400,
            "Wpisz tytuł punktu.",
          );
          const s = one(db, "SELECT * FROM sessions WHERE id=?", b.sessionId);
          requireThat(
            s?.status === "draft",
            409,
            "Punkty można dodawać w fazie przygotowania.",
          );
          transaction(db, () => {
            const id = randomBytes(16).toString("hex"),
              position = one(
                db,
                "SELECT COALESCE(MAX(position),0)+1 AS n FROM agenda WHERE session_id=?",
                s.id,
              )!.n;
            run(
              db,
              "INSERT INTO agenda VALUES(?,?,?,?)",
              id,
              s.id,
              position,
              b.title.trim(),
            );
            run(
              db,
              "UPDATE sessions SET active_agenda=COALESCE(active_agenda,?) WHERE id=?",
              id,
              s.id,
            );
            audit(db, actor.id, "AGENDA_ADDED", { id, title: b.title });
          });
        } else if (path === "/api/agenda/activate") {
          allow("admin");
          const item = one(db, "SELECT * FROM agenda WHERE id=?", b.agendaId);
          requireThat(item, 404, "Brak punktu.");
          transaction(db, () => {
            run(
              db,
              "UPDATE sessions SET active_agenda=? WHERE id=?",
              item.id,
              item.session_id,
            );
            audit(db, actor.id, "AGENDA_CHANGED", { agendaId: item.id });
            event(db, "AGENDA_CHANGED", null, { agendaId: item.id });
          });
        } else if (path === "/api/attendance/control") {
          allow("admin");
          requireThat(typeof b.open === "boolean", 400, "Nieprawidłowy stan.");
          const s = one(db, "SELECT * FROM sessions WHERE id=?", b.sessionId);
          requireThat(s && s.status !== "ended", 409, "Sesja jest zakończona.");
          transaction(db, () => {
            run(
              db,
              "UPDATE sessions SET attendance_open=? WHERE id=?",
              Number(b.open),
              b.sessionId,
            );
            audit(db, actor.id, "ATTENDANCE_CONTROL", b);
          });
        } else if (path === "/api/attendance") {
          allow("member");
          requireThat(
            typeof b.present === "boolean",
            400,
            "Nieprawidłowy stan obecności.",
          );
          const s = one(db, "SELECT * FROM sessions WHERE id=?", b.sessionId);
          requireThat(
            s?.attendance_open && s.status !== "ended",
            409,
            "Rejestracja obecności jest zamknięta.",
          );
          requireThat(
            !one(
              db,
              "SELECT id FROM votes WHERE session_id=? AND status='OPEN'",
              s.id,
            ),
            409,
            "Zmiana obecności wymaga zamknięcia głosowania.",
          );
          transaction(db, () => {
            const at = new Date().toISOString();
            run(
              db,
              "INSERT INTO attendance VALUES(?,?,?,?) ON CONFLICT(session_id,user_id) DO UPDATE SET present=excluded.present,at=excluded.at",
              s.id,
              actor.id,
              Number(b.present),
              at,
            );
            audit(db, actor.id, "ATTENDANCE_CHANGED", {
              sessionId: s.id,
              present: b.present,
              at,
            });
            result = { ok: true, at };
          });
        } else if (path === "/api/votes") {
          allow("admin");
          result = createVote(db, actor, b);
        } else if (
          /^\/api\/votes\/[^/]+\/(open|close|approve|publish)$/.test(path)
        ) {
          allow("admin");
          const parts = path.split("/");
          result = transition(db, actor, parts[3], parts[4]);
        } else if (/^\/api\/votes\/[^/]+\/ballots$/.test(path)) {
          allow("member");
          result = castBallot(
            db,
            actor,
            path.split("/")[3],
            b.choice,
            b.requestId,
          );
        } else if (path === "/api/graphics/ready") {
          allow("graphics");
          const r = one(db, "SELECT * FROM results WHERE vote_id=?", b.voteId);
          requireThat(
            r && r.version === b.version,
            409,
            "Grafika musi dotyczyć zatwierdzonej wersji.",
          );
          run(
            db,
            "INSERT INTO graphics_ready VALUES(?,?,?) ON CONFLICT(vote_id) DO UPDATE SET version=excluded.version,at=excluded.at",
            b.voteId,
            b.version,
            Date.now(),
          );
          return send(res, 200, { ok: true });
        } else if (path === "/api/production/control") {
          allow("production");
          requireThat(
            ["hide", "auto", "manual"].includes(b.action),
            400,
            "Nieprawidłowa operacja.",
          );
          transaction(db, () => {
            if (b.action === "hide")
              run(
                db,
                "UPDATE production SET hide_epoch=hide_epoch+1,program_vote=NULL WHERE id=1",
              );
            else
              run(
                db,
                "UPDATE production SET mode=?,hide_epoch=hide_epoch+1,program_vote=NULL WHERE id=1",
                b.action === "auto" ? "AUTO" : "MANUAL",
              );
            audit(db, actor.id, "PRODUCTION_CONTROL", b);
          });
        } else if (path === "/api/bridge/status") {
          allow("bridge");
          requireThat(
            ["connected", "PROGRAM", "hidden", "error", "skipped"].includes(
              b.status,
            ),
            400,
            "Nieprawidłowy status.",
          );
          transaction(db, () => {
            const previous = one(
              db,
              "SELECT bridge_status,program_vote FROM production",
            )!;
            run(
              db,
              "UPDATE production SET bridge_at=?,bridge_status=?,program_vote=? WHERE id=1",
              Date.now(),
              b.status,
              b.status === "PROGRAM" ? b.voteId : null,
            );
            if (b.status === "PROGRAM") {
              const v = one(
                db,
                "SELECT status FROM votes WHERE id=?",
                b.voteId,
              );
              requireThat(
                v && ["APPROVED", "PUBLISHED"].includes(v.status),
                409,
                "Wynik nie jest zatwierdzony.",
              );
              run(
                db,
                "UPDATE votes SET status='PUBLISHED' WHERE id=?",
                b.voteId,
              );
            }
            if (
              b.status !== "connected" &&
              (previous.bridge_status !== b.status ||
                previous.program_vote !==
                  (b.status === "PROGRAM" ? b.voteId : null))
            )
              audit(db, actor.id, "BRIDGE_STATUS", {
                status: b.status,
                voteId: b.voteId || null,
                message: String(b.message || "").slice(0, 300),
              });
          });
        } else throw new Fault(404, "Nie znaleziono zasobu.");
        broadcast();
        return send(res, 200, result);
      }
      requireThat(
        ["GET", "HEAD"].includes(req.method || ""),
        405,
        "Niedozwolona metoda.",
      );
      const dist = resolve("dist"),
        filename = resolve(dist, decodeURIComponent(path).replace(/^\//, ""));
      const rel = relative(dist, filename);
      requireThat(
        !rel.startsWith("..") && !isAbsolute(rel),
        403,
        "Niedozwolona ścieżka.",
      );
      const file =
        existsSync(filename) && extname(filename)
          ? filename
          : resolve(dist, "index.html");
      if (!existsSync(file))
        return send(res, 503, { error: "Najpierw uruchom npm run build." });
      const mime: Row = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      });
      res.end(req.method === "HEAD" ? undefined : readFileSync(file));
    } catch (e) {
      if (!res.headersSent) {
        if (!(e instanceof Fault))
          console.error(
            "Błąd serwera:",
            e instanceof Error ? e.message : "unknown",
          );
        send(res, e instanceof Fault ? e.status : 500, {
          error:
            e instanceof Fault
              ? e.message
              : "Błąd serwera. Operacja nie została potwierdzona.",
        });
      } else res.end();
    }
  });
  const heartbeat = setInterval(() => {
    for (const [res, actor] of streams) {
      if (actor.expires <= Date.now()) {
        res.end();
        streams.delete(res);
      } else res.write(": heartbeat\n\n");
    }
  }, 10000);
  heartbeat.unref();
  server.on("close", () => {
    clearInterval(heartbeat);
    for (const res of connections) res.end();
  });
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const host = process.env.HOST || "127.0.0.1",
    secure = process.env.SECURE_COOKIE === "true";
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !secure)
    throw new Error(
      "Udostępnienie w LAN wymaga SECURE_COOKIE=true i zaufanego reverse proxy HTTPS.",
    );
  const db = openDb();
  const server = makeServer(db, { secure });
  server.listen(Number(process.env.PORT || 3000), host, () =>
    console.log(
      `GOLINA e-SESJA · ${host}:${process.env.PORT || 3000} · prototyp demonstracyjny`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      server.close(() => {
        db.close();
        process.exit(0);
      });
      server.closeAllConnections();
    });
}
