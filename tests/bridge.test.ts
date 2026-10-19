import { test } from "node:test";
import assert from "node:assert/strict";
import { Bridge, type Cue, type Snapshot } from "../bridge/bridge.ts";
function fixture() {
  let now = 1000000;
  const commands: boolean[] = [],
    statuses: string[] = [],
    saved: string[][] = [];
  let fail = false;
  let snap: Snapshot = {
    cursor: 0,
    event: null,
    production: { mode: "AUTO", hide_epoch: 0 },
  };
  const b = new Bridge({
    poll: async () => snap,
    status: async (s) => {
      statuses.push(s);
    },
    overlay: async (show) => {
      commands.push(show);
      if (fail && show) throw new Error("vMix disconnected");
    },
    save: (ids) => saved.push(ids),
    now: () => now,
  });
  return {
    b,
    commands,
    statuses,
    saved,
    setSnapshot: (s: Snapshot) => (snap = s),
    advance: (n: number) => (now += n),
    fail: () => (fail = true),
    cue: (id = "vote-1", ready = true): Cue => ({
      seq: 1,
      event_id: "event-" + id,
      vote_id: id,
      at: new Date(now).toISOString(),
      ready,
      payload: { resultVersion: 1 },
    }),
  };
}
test("no replay on startup, ready handshake, one overlay for 15 seconds", async () => {
  const f = fixture();
  const cue = f.cue();
  f.setSnapshot({
    cursor: 1,
    event: cue,
    production: { mode: "AUTO", hide_epoch: 0 },
  });
  await f.b.tick();
  assert.deepEqual(f.commands, [false]);
  assert.equal(f.b.cursor, 1);
  const next = { ...f.cue("vote-2", false), seq: 2 };
  f.setSnapshot({
    cursor: 2,
    event: next,
    production: { mode: "AUTO", hide_epoch: 0 },
  });
  await f.b.tick();
  assert.equal(f.commands.length, 1);
  assert.equal(f.b.cursor, 1);
  next.ready = true;
  await f.b.tick();
  await f.b.tick();
  assert.equal(f.commands.filter(Boolean).length, 1);
  assert.equal(f.saved.length, 1);
  f.setSnapshot({
    cursor: 2,
    event: null,
    production: { mode: "AUTO", hide_epoch: 0 },
  });
  f.advance(14999);
  await f.b.tick();
  assert.equal(f.commands.at(-1), true);
  f.advance(1);
  await f.b.tick();
  assert.equal(f.commands.at(-1), false);
});
test("stale cues skipped and emergency hide/manual suppress auto", async () => {
  const f = fixture();
  await f.b.tick();
  const c = f.cue();
  f.advance(31000);
  f.setSnapshot({
    cursor: 1,
    event: c,
    production: { mode: "AUTO", hide_epoch: 0 },
  });
  await f.b.tick();
  assert.equal(f.commands.filter(Boolean).length, 0);
  const next = f.cue("new");
  f.setSnapshot({
    cursor: 2,
    event: next,
    production: { mode: "AUTO", hide_epoch: 0 },
  });
  await f.b.tick();
  assert.equal(f.commands.at(-1), true);
  f.setSnapshot({
    cursor: 2,
    event: next,
    production: { mode: "AUTO", hide_epoch: 1 },
  });
  await f.b.tick();
  assert.equal(f.commands.at(-1), false);
  f.setSnapshot({
    cursor: 3,
    event: f.cue("manual"),
    production: { mode: "MANUAL", hide_epoch: 2 },
  });
  await f.b.tick();
  assert.equal(f.commands.filter(Boolean).length, 1);
});
test("ambiguous vMix failure never retries historical cue and does not affect ballots", async () => {
  const f = fixture();
  await f.b.tick();
  f.fail();
  const c = f.cue();
  f.setSnapshot({
    cursor: 1,
    event: c,
    production: { mode: "AUTO", hide_epoch: 0 },
  });
  await assert.rejects(f.b.tick(), /disconnected/);
  assert.equal(f.saved.length, 1);
  assert.ok(f.statuses.includes("error"));
  await f.b.tick();
  assert.equal(f.commands.filter(Boolean).length, 1);
  assert.equal(f.commands.at(-1), false);
});
