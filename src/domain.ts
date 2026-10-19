import {
  all,
  one,
  run,
  transaction,
  audit,
  event,
  type DB,
  type Row,
} from "./db.ts";
import { randomUUID } from "node:crypto";
export class Fault extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function requireThat(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new Fault(status, message);
}
export function calculate(vote: Row, members: Row[], statutory: number) {
  const counts = { YES: 0, NO: 0, ABSTAIN: 0, MISSING: 0, ABSENT: 0 };
  const list = members.map((m) => {
    const choice = m.present ? m.choice || "MISSING" : "ABSENT";
    counts[choice as keyof typeof counts]++;
    return { id: m.user_id, name: m.name, choice };
  });
  const present = members.filter((m) => m.present).length,
    quorum = present >= Math.floor(statutory / 2) + 1;
  const cast = counts.YES + counts.NO + counts.ABSTAIN;
  const threshold =
    vote.rule === "simple"
      ? counts.NO + 1
      : vote.rule === "absolute"
        ? Math.floor(cast / 2) + 1
        : Math.ceil((statutory * vote.numerator) / vote.denominator);
  return {
    counts,
    members: list,
    present,
    statutory,
    quorum,
    cast,
    threshold,
    passed: quorum && counts.YES >= threshold,
    rule: vote.rule,
  };
}
export function compute(db: DB, vote: Row) {
  const session = one(
    db,
    "SELECT * FROM sessions WHERE id=?",
    vote.session_id,
  )!;
  return calculate(
    vote,
    all(
      db,
      "SELECT e.*,u.name,b.choice FROM electorate e JOIN users u ON u.id=e.user_id LEFT JOIN ballots b ON b.vote_id=e.vote_id AND b.user_id=e.user_id WHERE e.vote_id=? ORDER BY u.name",
      vote.id,
    ),
    session.statutory,
  );
}
export function castBallot(
  db: DB,
  actor: Row,
  voteId: string,
  choice: string,
  requestId: string,
) {
  requireThat(
    ["YES", "NO", "ABSTAIN"].includes(choice),
    400,
    "Nieprawidłowy wybór.",
  );
  requireThat(
    typeof requestId === "string" && /^[a-zA-Z0-9-]{8,100}$/.test(requestId),
    400,
    "Brak poprawnego klucza idempotencji.",
  );
  return transaction(db, () => {
    const existing = one(
      db,
      "SELECT * FROM ballots WHERE user_id=? AND request_id=?",
      actor.id,
      requestId,
    );
    if (existing) {
      requireThat(
        existing.vote_id === voteId && existing.choice === choice,
        409,
        "Klucz użyty dla innego polecenia.",
      );
      return {
        saved: true,
        choice: existing.choice,
        at: existing.at,
        replayed: true,
      };
    }
    const vote = one(db, "SELECT * FROM votes WHERE id=?", voteId);
    requireThat(vote?.status === "OPEN", 409, "Głosowanie nie jest otwarte.");
    const session = one(
      db,
      "SELECT status FROM sessions WHERE id=?",
      vote.session_id,
    );
    requireThat(session?.status === "live", 409, "Sesja jest wstrzymana.");
    requireThat(
      one(
        db,
        "SELECT present FROM electorate WHERE vote_id=? AND user_id=?",
        voteId,
        actor.id,
      )?.present,
      403,
      "Nie potwierdzono obecności przed otwarciem głosowania.",
    );
    requireThat(
      !one(
        db,
        "SELECT 1 FROM ballots WHERE vote_id=? AND user_id=?",
        voteId,
        actor.id,
      ),
      409,
      "Twój głos został już zapisany.",
    );
    const at = new Date().toISOString();
    run(
      db,
      "INSERT INTO ballots VALUES(?,?,?,?,?)",
      voteId,
      actor.id,
      choice,
      requestId,
      at,
    );
    audit(db, actor.id, "BALLOT_RECORDED", { voteId, requestId });
    return { saved: true, choice, at, replayed: false };
  });
}
export function transition(db: DB, actor: Row, voteId: string, action: string) {
  return transaction(db, () => {
    const vote = one(db, "SELECT * FROM votes WHERE id=?", voteId);
    requireThat(vote, 404, "Nie znaleziono głosowania.");
    const session = one(
      db,
      "SELECT * FROM sessions WHERE id=?",
      vote.session_id,
    )!;
    const target = (
      {
        open: "OPEN",
        close: "CLOSED",
        approve: "APPROVED",
        publish: "PUBLISHED",
      } as Row
    )[action];
    requireThat(target, 400, "Nieprawidłowa operacja.");
    if (
      vote.status === target ||
      (action === "approve" && vote.status === "PUBLISHED")
    )
      return { ok: true };
    const from = (
      {
        open: "DRAFT",
        close: "OPEN",
        approve: "CLOSED",
        publish: "APPROVED",
      } as Row
    )[action];
    requireThat(
      vote.status === from,
      409,
      `Niedozwolona zmiana stanu ${vote.status}.`,
    );
    if (action === "open") {
      requireThat(session.status === "live", 409, "Najpierw rozpocznij sesję.");
      requireThat(
        !one(
          db,
          "SELECT id FROM votes WHERE session_id=? AND status='OPEN'",
          session.id,
        ),
        409,
        "Inne głosowanie jest otwarte.",
      );
      const members = all(
        db,
        "SELECT u.id,COALESCE(a.present,0) AS present FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.session_id=? WHERE u.role='councillor'",
        session.id,
      );
      requireThat(
        members.length <= session.statutory,
        409,
        "Lista radnych przekracza skład ustawowy.",
      );
      requireThat(
        members.filter((m) => m.present).length >=
          Math.floor(session.statutory / 2) + 1,
        409,
        "Brak kworum.",
      );
      for (const m of members)
        run(
          db,
          "INSERT INTO electorate VALUES(?,?,?)",
          voteId,
          m.id,
          m.present,
        );
      run(
        db,
        "UPDATE votes SET opened_at=? WHERE id=?",
        new Date().toISOString(),
        voteId,
      );
    }
    if (action === "close")
      run(
        db,
        "UPDATE votes SET closed_at=? WHERE id=?",
        new Date().toISOString(),
        voteId,
      );
    if (action === "approve") {
      const snapshot = {
        ...compute(db, vote),
        voteId,
        question: vote.question,
        sessionId: session.id,
        sessionTitle: session.title,
        sessionNumber: session.number,
        version: 1,
      };
      run(
        db,
        "INSERT INTO results VALUES(?,?,?,?,?)",
        voteId,
        1,
        JSON.stringify(snapshot),
        actor.id,
        new Date().toISOString(),
      );
      event(db, "VOTE_RESULT_APPROVED", voteId, {
        voteId,
        sessionId: session.id,
        resultVersion: 1,
      });
    } else event(db, `VOTE_${target}`, voteId, { voteId });
    run(db, "UPDATE votes SET status=? WHERE id=?", target, voteId);
    audit(db, actor.id, `VOTE_${target}`, { voteId, from });
    return { ok: true };
  });
}
export function createVote(db: DB, actor: Row, body: Row) {
  const session = one(db, "SELECT * FROM sessions WHERE id=?", body.sessionId);
  requireThat(session, 404, "Nie znaleziono sesji.");
  requireThat(session.status !== "ended", 409, "Sesja została zakończona.");
  requireThat(
    !one(
      db,
      "SELECT id FROM votes WHERE session_id=? AND status IN ('DRAFT','OPEN','CLOSED')",
      session.id,
    ),
    409,
    "Najpierw zakończ i zatwierdź poprzednie głosowanie.",
  );
  requireThat(
    one(
      db,
      "SELECT id FROM agenda WHERE id=? AND session_id=?",
      body.agendaId,
      body.sessionId,
    ),
    400,
    "Nieprawidłowy punkt.",
  );
  requireThat(
    ["simple", "absolute", "qualified"].includes(body.rule),
    400,
    "Wybierz regułę większości.",
  );
  requireThat(
    typeof body.question === "string" &&
      body.question.trim().length >= 5 &&
      body.question.length <= 2000,
    400,
    "Pytanie musi mieć od 5 do 2000 znaków.",
  );
  const id = randomUUID();
  transaction(db, () => {
    run(
      db,
      "INSERT INTO votes(id,session_id,agenda_id,question,rule) VALUES(?,?,?,?,?)",
      id,
      body.sessionId,
      body.agendaId,
      body.question.trim(),
      body.rule,
    );
    audit(db, actor.id, "VOTE_CREATED", { id, ...body });
  });
  return { id };
}
export function state(db: DB, actor: Row) {
  const privileged = actor.role === "admin";
  const sessions = all(db, "SELECT * FROM sessions ORDER BY rowid DESC");
  const session = sessions[0] || null;
  if (!session)
    return {
      session: null,
      sessions,
      agenda: [],
      members: [],
      votes: [],
      production: {},
      audit: [],
    };
  const members = all(
    db,
    "SELECT u.id,u.name,COALESCE(a.present,0) AS present,a.at FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.session_id=? WHERE u.role='councillor' ORDER BY u.name",
    session.id,
  );
  const votes = all(
    db,
    "SELECT * FROM votes WHERE session_id=? ORDER BY rowid DESC",
    session.id,
  ).map((v) => {
    const r = one(db, "SELECT * FROM results WHERE vote_id=?", v.id);
    const own =
      actor.role === "councillor"
        ? one(
            db,
            "SELECT choice,at FROM ballots WHERE vote_id=? AND user_id=?",
            v.id,
            actor.id,
          )
        : undefined;
    const count = one(
      db,
      "SELECT COUNT(*) AS n FROM ballots WHERE vote_id=?",
      v.id,
    )!.n;
    return {
      ...v,
      count,
      own: own || null,
      result: r
        ? { ...JSON.parse(r.snapshot), approvedAt: r.approved_at }
        : null,
      review: privileged && v.status === "CLOSED" ? compute(db, v) : null,
    };
  });
  return {
    session,
    sessions,
    agenda: all(
      db,
      "SELECT * FROM agenda WHERE session_id=? ORDER BY position",
      session.id,
    ),
    members,
    votes,
    production: one(db, "SELECT * FROM production"),
    audit: privileged
      ? all(
          db,
          "SELECT seq,actor,action,at FROM audit ORDER BY seq DESC LIMIT 12",
        )
      : [],
  };
}
