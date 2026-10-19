import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { Bridge, type Snapshot } from "./bridge.ts";
const base = new URL(process.env.SERVER_URL || "http://127.0.0.1:3000");
if (
  base.protocol !== "https:" &&
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
)
  throw new Error("Połączenie LAN wymaga HTTPS z zaufanym certyfikatem.");
const vmix = new URL(process.env.VMIX_URL || "http://127.0.0.1:8088");
if (!["127.0.0.1", "localhost", "[::1]"].includes(vmix.hostname))
  throw new Error(
    "API vMix musi być dostępne wyłącznie lokalnie na komputerze realizatora.",
  );
const input = process.env.VMIX_INPUT;
if (!input)
  throw new Error("Ustaw VMIX_INPUT na GUID przygotowanego Browser Input.");
const layer = Number(process.env.VMIX_OVERLAY || 1),
  seconds = Number(process.env.OVERLAY_SECONDS || 15);
if (
  !Number.isInteger(layer) ||
  layer < 1 ||
  layer > 4 ||
  ![10, 15, 20, 30].includes(seconds)
)
  throw new Error("Nieprawidłowy overlay lub czas emisji.");
const statePath = resolve(
  process.env.BRIDGE_STATE || "./data/bridge-state.json",
);
mkdirSync(dirname(statePath), { recursive: true });
const seen = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : [];
if (!Array.isArray(seen) || !seen.every((i) => typeof i === "string"))
  throw new Error("Uszkodzony plik deduplikacji. Nie uruchomiono emisji.");
let cookie = "",
  csrf = "";
async function request(path: string, body?: unknown) {
  const r = await fetch(new URL(path, base), {
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrf,
    },
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`Serwer sesji: HTTP ${r.status}`);
  return r;
}
async function login() {
  const r = await request("/api/login", {
    username: process.env.BRIDGE_USERNAME || "bridge",
    password: process.env.BRIDGE_PASSWORD || "",
  });
  cookie = r.headers.get("set-cookie")?.split(";")[0] || "";
  csrf = ((await r.json()) as { csrf: string }).csrf;
}
await login();
const bridge = new Bridge(
  {
    poll: async (after) =>
      (await (
        await request(
          `/api/bridge/events${after === undefined ? "" : `?after=${after}`}`,
        )
      ).json()) as Snapshot,
    status: async (status, voteId, message) => {
      await request("/api/bridge/status", { status, voteId, message });
    },
    overlay: async (show) => {
      const url = new URL("/api/", vmix);
      url.searchParams.set(
        "Function",
        `OverlayInput${layer}${show ? "In" : "Out"}`,
      );
      if (show) url.searchParams.set("Input", input);
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`vMix HTTP ${response.status}`);
      const text = await response.text();
      if (/error|failed|invalid/i.test(text))
        throw new Error("vMix zgłosił błąd polecenia.");
    },
    save: (ids) => {
      writeFileSync(statePath + ".tmp", JSON.stringify(ids), { mode: 0o600 });
      renameSync(statePath + ".tmp", statePath);
    },
    now: Date.now,
  },
  { seen, seconds },
);
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopped = true;
  });
console.log("Bridge uruchomiony. Historyczne wyniki nie będą emitowane.");
while (!stopped) {
  try {
    await bridge.tick();
  } catch (e) {
    console.error(new Date().toISOString(), (e as Error).message);
    try {
      await login();
    } catch {}
  }
  await new Promise((r) => setTimeout(r, 500));
}
try {
  await bridge.stop();
} catch {
  console.error("Nie potwierdzono ukrycia nakładki. Sprawdź vMix lokalnie.");
}
