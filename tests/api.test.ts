import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { openDb, seed, one, all, run } from "../src/db.ts";
import { makeServer } from "../src/server.ts";
import { calculate } from "../src/domain.ts";
const dir = mkdtempSync(join(tmpdir(), "golina-"));
const db = openDb(join(dir, "test.sqlite"));
seed(db, "Test-only-password!");
const server = makeServer(db);
let base = "";
type Auth = { cookie: string; csrf: string };
async function call(path: string, body?: unknown, auth?: Auth) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
async function login(username: string) {
  const r = await call("/api/login", {
    username,
    password: "Test-only-password!",
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, csrf: r.data.csrf };
}
before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(async () => {
  await new Promise<void>((r) => {
    server.close(() => r());
    server.closeAllConnections();
  });
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("15 clients: transactional voting, private ballots, approval, bridge readiness, restart and backup", async () => {
  const admin = await login("admin"),
    production = await login("production"),
    display = await login("display"),
    graphics = await login("graphics"),
    bridge = await login("bridge");
  const councillors = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      login(`radny${String(i + 1).padStart(2, "0")}`),
    ),
  );
  assert.equal((await call("/api/state")).status, 401);
  assert.equal(
    (
      await call(
        "/api/session/control",
        { sessionId: "demo", action: "start" },
        councillors[0],
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/session/control",
        { sessionId: "demo", action: "start" },
        { ...admin, csrf: "wrong" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/session/control",
        { sessionId: "demo", action: "start" },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/attendance/control",
        { sessionId: "demo", open: true },
        admin,
      )
    ).status,
    200,
  );
  const presence = await Promise.all(
    councillors.map((a) =>
      call("/api/attendance", { sessionId: "demo", present: true }, a),
    ),
  );
  assert.ok(presence.every((r) => r.status === 200));
  const vote = await call(
    "/api/votes",
    {
      sessionId: "demo",
      agendaId: "agenda-3",
      question: "Czy przyjąć demonstracyjny porządek obrad?",
      rule: "simple",
    },
    admin,
  );
  assert.equal(vote.status, 200);
  const id = vote.data.id;
  assert.equal((await call(`/api/votes/${id}/open`, {}, admin)).status, 200);
  assert.equal(
    (
      await call(
        "/api/attendance",
        { sessionId: "demo", present: false },
        councillors[0],
      )
    ).status,
    409,
  );
  const replies = await Promise.all(
    councillors.map((a, i) =>
      call(
        `/api/votes/${id}/ballots`,
        {
          choice: i < 10 ? "YES" : i < 13 ? "NO" : "ABSTAIN",
          requestId: `concurrent-${i}`,
        },
        a,
      ),
    ),
  );
  assert.ok(replies.every((r) => r.status === 200));
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM ballots")?.n, 15);
  const repeat = await call(
    `/api/votes/${id}/ballots`,
    { choice: "YES", requestId: "concurrent-0" },
    councillors[0],
  );
  assert.equal(repeat.data.replayed, true);
  assert.equal(
    (
      await call(
        `/api/votes/${id}/ballots`,
        { choice: "NO", requestId: "concurrent-0" },
        councillors[0],
      )
    ).status,
    409,
  );
  const doubles = await Promise.all(
    [1, 2].map((n) =>
      call(
        `/api/votes/${id}/ballots`,
        { choice: "YES", requestId: `duplicate-${n}` },
        councillors[0],
      ),
    ),
  );
  assert.ok(doubles.every((r) => r.status === 409));
  for (const auth of [councillors[0], production, display, graphics]) {
    const s = await call("/api/state", undefined, auth);
    const v = s.data.votes[0];
    assert.equal(v.result, null);
    assert.equal(v.review, null);
    assert.equal(v.ballots, undefined);
    assert.equal(v.own?.choice, auth === councillors[0] ? "YES" : undefined);
  }
  assert.equal(
    (await call("/api/bridge/events?after=0", undefined, bridge)).data.event,
    null,
  );
  assert.equal((await call(`/api/votes/${id}/close`, {}, admin)).status, 200);
  assert.equal(
    (
      await call(
        `/api/votes/${id}/ballots`,
        { choice: "YES", requestId: "late-ballot-001" },
        councillors[0],
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("/api/state", undefined, production)).data.votes[0].result,
    null,
  );
  assert.equal(
    (await call(`/api/votes/${id}/approve`, {}, production)).status,
    403,
  );
  assert.equal((await call(`/api/votes/${id}/approve`, {}, admin)).status, 200);
  assert.equal((await call(`/api/votes/${id}/approve`, {}, admin)).status, 200);
  assert.equal(
    one(
      db,
      "SELECT COUNT(*) AS n FROM events WHERE kind='VOTE_RESULT_APPROVED'",
    )?.n,
    1,
  );
  const result = (await call("/api/state", undefined, display)).data.votes[0]
    .result;
  assert.deepEqual(result.counts, {
    YES: 10,
    NO: 3,
    ABSTAIN: 2,
    MISSING: 0,
    ABSENT: 0,
  });
  assert.equal(result.passed, true);
  assert.equal(result.members.length, 15);
  assert.equal(
    (await call("/api/bridge/events", undefined, bridge)).data.event,
    null,
    "startup never replays",
  );
  let cue = (await call("/api/bridge/events?after=0", undefined, bridge)).data
    .event;
  assert.equal(cue.ready, false);
  assert.equal(
    (await call("/api/graphics/ready", { voteId: id, version: 1 }, graphics))
      .status,
    200,
  );
  cue = (await call("/api/bridge/events?after=0", undefined, bridge)).data
    .event;
  assert.equal(cue.ready, true);
  assert.equal(
    (await call("/api/production/control", { action: "hide" }, production))
      .status,
    200,
  );
  assert.equal(
    (await call("/api/bridge/events", undefined, bridge)).data.production
      .hide_epoch,
    1,
  );
  assert.throws(() => run(db, "UPDATE ballots SET choice='NO'"), /immutable/);
  assert.throws(() => run(db, "DELETE FROM results"), /immutable/);
  assert.throws(() => run(db, "DELETE FROM audit"), /immutable/);
  const fresh = await login("admin");
  assert.equal(
    (await call("/api/state", undefined, fresh)).data.votes[0].result.counts
      .YES,
    10,
  );
  const copy = join(dir, "backup.sqlite");
  await backup(db, copy);
  const restored = openDb(copy);
  assert.equal(one(restored, "PRAGMA integrity_check")?.integrity_check, "ok");
  assert.equal(one(restored, "SELECT COUNT(*) AS n FROM ballots")?.n, 15);
  restored.close();
});
test("majority boundaries, quorum, missing differs from absent", () => {
  const members = (choices: string[]) =>
    choices.map((choice, i) => ({
      user_id: String(i),
      name: String(i),
      present: choice !== "ABSENT",
      choice: choice === "MISSING" || choice === "ABSENT" ? null : choice,
    }));
  let r = calculate(
    { rule: "simple" },
    members(["YES", "NO", "ABSTAIN", "MISSING", "ABSENT"]),
    5,
  );
  assert.equal(r.passed, false);
  assert.equal(r.quorum, true);
  assert.equal(r.counts.MISSING, 1);
  assert.equal(r.counts.ABSENT, 1);
  r = calculate(
    { rule: "absolute" },
    members(["YES", "YES", "NO", "ABSTAIN", "ABSENT"]),
    5,
  );
  assert.equal(r.passed, false);
  assert.equal(r.threshold, 3);
  r = calculate(
    { rule: "absolute" },
    members(["YES", "YES", "YES", "NO", "ABSENT"]),
    5,
  );
  assert.equal(r.passed, true);
  r = calculate(
    { rule: "qualified", numerator: 2, denominator: 3 },
    members(["YES", "YES", "YES", "NO", "ABSENT"]),
    5,
  );
  assert.equal(r.threshold, 4);
  assert.equal(r.passed, false);
  r = calculate(
    { rule: "simple" },
    members(["YES", "YES", "ABSENT", "ABSENT", "ABSENT"]),
    5,
  );
  assert.equal(r.quorum, false);
  assert.equal(r.passed, false);
  r = calculate(
    { rule: "simple" },
    members(["ABSTAIN", "ABSTAIN", "ABSTAIN"]),
    3,
  );
  assert.equal(r.passed, false);
});
test("two simultaneous first votes create one ballot; closure race and absent eligibility", async () => {
  const admin = await login("admin"),
    member = await login("radny01"),
    absent = await login("radny15");
  assert.equal(
    (
      await call(
        "/api/attendance",
        { sessionId: "demo", present: false },
        absent,
      )
    ).status,
    200,
  );
  const created = await call(
    "/api/votes",
    {
      sessionId: "demo",
      agendaId: "agenda-4",
      question: "Test graniczny zamknięcia głosowania",
      rule: "simple",
    },
    admin,
  );
  const id = created.data.id;
  await call(`/api/votes/${id}/open`, {}, admin);
  assert.equal(
    (
      await call(
        `/api/votes/${id}/ballots`,
        { choice: "YES", requestId: "absent-user-01" },
        absent,
      )
    ).status,
    403,
  );
  const double = await Promise.all(
    ["parallel-key-1", "parallel-key-2"].map((requestId) =>
      call(`/api/votes/${id}/ballots`, { choice: "YES", requestId }, member),
    ),
  );
  assert.deepEqual(double.map((r) => r.status).sort(), [200, 409]);
  const races = await Promise.all([
    call(`/api/votes/${id}/close`, {}, admin),
    call(
      `/api/votes/${id}/ballots`,
      { choice: "NO", requestId: "race-close-key" },
      await login("radny02"),
    ),
  ]);
  assert.equal(races[0].status, 200);
  assert.ok([200, 409].includes(races[1].status));
  const count = one(
    db,
    "SELECT COUNT(*) AS n FROM ballots WHERE vote_id=?",
    id,
  )!.n;
  assert.equal(
    (
      await call(
        `/api/votes/${id}/ballots`,
        { choice: "YES", requestId: "after-close-001" },
        await login("radny03"),
      )
    ).status,
    409,
  );
  assert.equal(
    one(db, "SELECT COUNT(*) AS n FROM ballots WHERE vote_id=?", id)!.n,
    count,
  );
  await call(`/api/votes/${id}/approve`, {}, admin);
  const r = (await call("/api/state", undefined, admin)).data.votes[0].result;
  assert.equal(r.counts.ABSENT, 1);
  assert.ok(r.counts.MISSING >= 12);
});
