import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, seed, one, run } from "../src/db.ts";
import { makeServer } from "../src/server.ts";
import { createVote, transition } from "../src/domain.ts";
test("Bridge CLI connects to real session API and mock vMix HTTP; failed vMix leaves voting available", async () => {
  const db = openDb(":memory:");
  seed(db, "CLI-integration-test!");
  const admin = { id: "admin" };
  run(db, "UPDATE sessions SET status='live' WHERE id='demo'");
  for (let i = 1; i <= 15; i++)
    run(
      db,
      "INSERT INTO attendance VALUES(?,?,?,?)",
      "demo",
      `radny${String(i).padStart(2, "0")}`,
      1,
      new Date().toISOString(),
    );
  const backend = makeServer(db);
  await new Promise<void>((r) => backend.listen(0, "127.0.0.1", r));
  const port = (backend.address() as any).port;
  const calls: URL[] = [];
  let fail = false;
  const vmix = createServer((req, res) => {
    calls.push(new URL(req.url || "/", `http://${req.headers.host}`));
    res.writeHead(fail ? 503 : 200, { "Content-Type": "text/plain" });
    res.end(fail ? "unavailable" : "OK");
  });
  await new Promise<void>((r) => vmix.listen(0, "127.0.0.1", r));
  const dir = mkdtempSync(join(tmpdir(), "golina-bridge-"));
  let output = "";
  const child = spawn(process.execPath, ["bridge/cli.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SERVER_URL: `http://127.0.0.1:${port}`,
      BRIDGE_PASSWORD: "CLI-integration-test!",
      BRIDGE_USERNAME: "bridge",
      VMIX_URL: `http://127.0.0.1:${(vmix.address() as any).port}`,
      VMIX_INPUT: "mock-input-guid",
      VMIX_OVERLAY: "1",
      OVERLAY_SECONDS: "15",
      BRIDGE_STATE: join(dir, "state.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const until = async (check: () => boolean) => {
    const end = Date.now() + 7000;
    while (!check() && Date.now() < end)
      await new Promise((r) => setTimeout(r, 30));
    assert.ok(check(), output);
  };
  try {
    await until(
      () =>
        one(db, "SELECT bridge_status FROM production")?.bridge_status ===
        "connected",
    );
    assert.equal(calls[0].searchParams.get("Function"), "OverlayInput1Out");
    const id = createVote(db, admin, {
      sessionId: "demo",
      agendaId: "agenda-1",
      question: "Test rzeczywistego protokołu HTTP Bridge",
      rule: "simple",
    }).id;
    transition(db, admin, id, "open");
    transition(db, admin, id, "close");
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(
      calls.filter((u) => u.searchParams.get("Function") === "OverlayInput1In")
        .length,
      0,
    );
    transition(db, admin, id, "approve");
    run(db, "INSERT INTO graphics_ready VALUES(?,?,?)", id, 1, Date.now() + 1);
    await until(
      () =>
        one(db, "SELECT bridge_status FROM production")?.bridge_status ===
        "PROGRAM",
    );
    const show = calls.find(
      (u) => u.searchParams.get("Function") === "OverlayInput1In",
    )!;
    assert.equal(show.searchParams.get("Input"), "mock-input-guid");
    assert.equal(
      one(db, "SELECT status FROM votes WHERE id=?", id)?.status,
      "PUBLISHED",
    );
    run(db, "UPDATE production SET hide_epoch=hide_epoch+1 WHERE id=1");
    await until(
      () =>
        one(db, "SELECT bridge_status FROM production")?.bridge_status ===
          "hidden" ||
        calls.filter(
          (u) => u.searchParams.get("Function") === "OverlayInput1Out",
        ).length >= 2,
    );
    fail = true;
    const id2 = createVote(db, admin, {
      sessionId: "demo",
      agendaId: "agenda-2",
      question: "Głosowanie przy awarii realizacji transmisji",
      rule: "simple",
    }).id;
    transition(db, admin, id2, "open");
    transition(db, admin, id2, "close");
    transition(db, admin, id2, "approve");
    run(db, "INSERT INTO graphics_ready VALUES(?,?,?)", id2, 1, Date.now() + 1);
    await until(
      () =>
        one(db, "SELECT bridge_status FROM production")?.bridge_status ===
        "error",
    );
    assert.equal(one(db, "SELECT COUNT(*) AS n FROM results")?.n, 2);
    const id3 = createVote(db, admin, {
      sessionId: "demo",
      agendaId: "agenda-3",
      question: "Głosowanie pozostaje dostępne bez vMix",
      rule: "simple",
    }).id;
    transition(db, admin, id3, "open");
    assert.equal(
      one(db, "SELECT status FROM votes WHERE id=?", id3)?.status,
      "OPEN",
    );
  } finally {
    fail = false;
    child.kill("SIGTERM");
    await new Promise<void>((r) => {
      if (child.exitCode !== null) return r();
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        r();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timeout);
        r();
      });
    });
    await Promise.all([
      new Promise<void>((r) => {
        backend.close(() => r());
        backend.closeAllConnections();
      }),
      new Promise<void>((r) => {
        vmix.close(() => r());
        vmix.closeAllConnections();
      }),
    ]);
    db.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
