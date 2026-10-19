/** At-most-once cue delivery. Actual vMix compatibility requires a hardware acceptance test. */
export type Cue = {
  seq: number;
  event_id: string;
  vote_id: string;
  at: string;
  ready: boolean;
  payload: { resultVersion: number };
};
export type Snapshot = {
  cursor: number;
  event: Cue | null;
  production: { mode: string; hide_epoch: number };
};
export type BridgeIO = {
  poll: (after?: number) => Promise<Snapshot>;
  status: (status: string, voteId?: string, message?: string) => Promise<void>;
  overlay: (show: boolean) => Promise<void>;
  save: (ids: string[]) => void;
  now: () => number;
};
export class Bridge {
  io: BridgeIO;
  cursor: number | undefined;
  seen: Set<string>;
  hiddenEpoch = 0;
  started = false;
  showing: string | null = null;
  expires = 0;
  duration: number;
  pending: Cue | null = null;
  needsHide = false;
  constructor(
    io: BridgeIO,
    options: { seen?: string[]; seconds?: number } = {},
  ) {
    this.io = io;
    this.seen = new Set(options.seen || []);
    this.duration = (options.seconds || 15) * 1000;
  }
  async hide() {
    await this.io.overlay(false);
    this.showing = null;
    this.needsHide = false;
    this.expires = 0;
    await this.io.status("hidden");
  }
  async tick() {
    try {
      if (this.needsHide) await this.hide();
      const s = await this.io.poll(this.cursor);
      if (!this.started) {
        this.cursor = s.cursor;
        this.hiddenEpoch = s.production.hide_epoch;
        this.started = true;
        this.pending = null;
        this.needsHide = true;
        await this.hide();
        await this.io.status("connected");
        return;
      }
      const manual = s.production.mode !== "AUTO",
        hide = s.production.hide_epoch !== this.hiddenEpoch;
      this.hiddenEpoch = s.production.hide_epoch;
      if (manual || hide) {
        this.pending = null;
        this.cursor = s.cursor;
        if (this.showing || hide) {
          this.needsHide = true;
          await this.hide();
        }
        await this.io.status("connected");
        return;
      }
      if (this.showing && this.io.now() >= this.expires) {
        this.needsHide = true;
        await this.hide();
      }
      const event = s.event;
      if (!event) {
        this.pending = null;
        this.cursor = s.cursor;
        await this.io.status(
          this.showing ? "PROGRAM" : "connected",
          this.showing || undefined,
        );
        return;
      }
      const age = this.io.now() - Date.parse(event.at);
      if (this.seen.has(event.event_id) || age < 0 || age > 30000) {
        this.cursor = s.cursor;
        this.pending = null;
        await this.io.status(
          "skipped",
          event.vote_id,
          "Duplikat lub nieaktualny wynik.",
        );
        return;
      }
      if (!event.ready) {
        this.pending = event;
        return;
      } // Keep cursor until matching browser paint acknowledgement.
      if (this.showing) {
        this.needsHide = true;
        await this.hide();
      }
      this.seen.add(event.event_id);
      this.io.save([...this.seen].slice(-2000)); // Persist BEFORE network command: never replay an ambiguous success.
      this.cursor = s.cursor;
      this.pending = null;
      this.needsHide = true; // Even an HTTP timeout may have enabled the overlay.
      await this.io.overlay(true);
      this.showing = event.vote_id;
      this.expires = this.io.now() + this.duration;
      this.needsHide = false;
      await this.io.status("PROGRAM", event.vote_id);
    } catch (e) {
      this.pending = null;
      this.cursor = undefined;
      this.started = false;
      if (this.showing) this.needsHide = true;
      try {
        await this.io.status("error", undefined, (e as Error).message);
      } catch {}
      throw e;
    }
  }
  async stop() {
    this.pending = null;
    this.needsHide = true;
    await this.hide();
  }
}
