import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  CalendarDays,
  ListOrdered,
  Vote,
  Users,
  FileText,
  Radio,
  Monitor,
  Settings,
  Activity,
  LogOut,
  ArrowUpRight,
  ChevronRight,
  ChevronLeft,
  Plus,
  Play,
  Pause,
  Square,
  Check,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Clock3,
  X,
  Download,
  Eye,
  Circle,
  CircleHelp,
} from "lucide-react";
import "./style.css";
type Data = Record<string, any>;
let csrf = "";
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    credentials: "same-origin",
    headers: body
      ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
      : {},
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Błąd połączenia z serwerem.");
  return d;
}
const choices: Data = {
  YES: "ZA",
  NO: "PRZECIW",
  ABSTAIN: "WSTRZYMUJĘ SIĘ",
  MISSING: "BRAK GŁOSU",
  ABSENT: "NIEOBECNY",
};
const statuses: Data = {
  DRAFT: "Przygotowane",
  OPEN: "Trwa głosowanie",
  CLOSED: "Do zatwierdzenia",
  APPROVED: "Zatwierdzony",
  PUBLISHED: "Opublikowany",
};
const rules: Data = {
  simple: "Zwykła · ZA > PRZECIW",
  absolute: "Bezwzględna · ponad połowa oddanych",
  qualified: "Kwalifikowana · ⅔ ustawowego składu",
};
const sessionStatuses: Data = {
  draft: "Przygotowanie",
  live: "Sesja w toku",
  break: "Przerwa",
  ended: "Sesja zakończona",
};
const time = (x: string) =>
  new Date(x).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Warsaw",
  });
function Brand() {
  return (
    <div className="brand">
      <div className="brand-symbol">
        <span>G</span>
        <i />
      </div>
      <div>
        GOLINA<span>e-SESJA</span>
      </div>
    </div>
  );
}
function App() {
  const [user, setUser] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [data, setData] = useState<Data | null>(null),
    [online, setOnline] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(location.pathname),
    [modal, setModal] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{
      text: string;
      run: () => Promise<void>;
    } | null>(null);
  useEffect(() => {
    api("/api/me")
      .then((d) => {
        csrf = d.csrf;
        setUser(d.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    const pop = () => setPage(location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!user) return;
    const allowed =
      user.role === "admin" ||
      user.role === "councillor" ||
      (user.role === "production" &&
        [
          "/production",
          "/display",
          "/admin/reports",
          "/admin/diagnostics",
        ].includes(page)) ||
      (user.role === "display" && page === "/display") ||
      (user.role === "graphics" && page.startsWith("/production/vmix/"));
    if (!allowed) {
      const target =
        user.role === "production"
          ? "/production"
          : user.role === "graphics"
            ? "/production/vmix/results"
            : user.role === "display"
              ? "/display"
              : "/production";
      history.replaceState({}, "", target);
      setPage(target);
    }
  }, [user, page]);
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const es = new EventSource("/api/events");
    es.addEventListener("state", (e) => {
      if (!stopped) {
        setData(JSON.parse((e as MessageEvent).data));
        setOnline(true);
      }
    });
    es.onerror = () => setOnline(false);
    return () => {
      stopped = true;
      es.close();
      setData(null);
    };
  }, [user]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const go = (to: string) => {
    history.pushState({}, "", to);
    setPage(to);
  };
  const action = async (
    path: string,
    body: unknown,
    message = "Zapisano na serwerze.",
  ) => {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      setNotice(message);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ask = (text: string, run: () => Promise<void>) =>
    setConfirm({ text, run });
  if (loading)
    return (
      <div className="loading">
        <Brand />
        <p>Łączenie z serwerem sesji…</p>
      </div>
    );
  if (!user)
    return (
      <Login
        onLogin={(d) => {
          csrf = d.csrf;
          setUser(d.user);
        }}
      />
    );
  const logout = async () => {
    try {
      await api("/api/logout", {});
      setUser(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!data)
    return (
      <div className="loading">
        <Brand />
        <p>{online ? "Wczytywanie sesji…" : "Łączenie z lokalnym serwerem…"}</p>
        <button onClick={logout}>Wyloguj</button>
      </div>
    );
  const session = data.session,
    agenda = data.agenda as Data[],
    members = data.members as Data[],
    votes = data.votes as Data[],
    active = agenda.find((i) => i.id === session?.active_agenda),
    vote = votes.find((v) => v.status === "OPEN") || votes[0],
    approved = votes.find((v) => v.result),
    present = members.filter((m) => m.present).length,
    quorum = present >= Math.floor((session?.statutory || 15) / 2) + 1;
  const common = {
    data,
    user,
    online,
    action,
    busy,
    ask,
    active,
    vote,
    approved,
    present,
    quorum,
  };
  const isGraphic = page.startsWith("/production/vmix/");
  if (page === "/display" || isGraphic)
    return (
      <>
        <Presentation {...common} path={page} />
        <button className="screen-exit" onClick={logout} title="Wyloguj">
          <LogOut size={16} />
        </button>
      </>
    );
  const nav = [
    {
      label: "PRZESTRZEŃ SESJI",
      items: [
        ["/admin", "Pulpit", LayoutDashboard],
        ["/admin/sessions", "Sesje", CalendarDays],
        ["/admin/agenda", "Porządek obrad", ListOrdered],
        ["/admin/voting", "Głosowania", Vote],
        ["/admin/attendance", "Obecność i radni", Users],
      ],
    },
    {
      label: "PROWADZENIE",
      items: [
        ["/admin/director", "Reżyser sesji", Radio],
        ["/display", "Ekran prezentacyjny", Monitor],
        ["/production", "Realizator / vMix", Eye],
      ],
    },
    {
      label: "DOKUMENTACJA",
      items: [
        ["/admin/reports", "Raporty i archiwum", FileText],
        ["/admin/diagnostics", "Diagnostyka", Activity],
      ],
    },
  ];
  const title =
    page === "/production"
      ? "Realizator / vMix"
      : ((nav.flatMap((n) => n.items).find((n) => n[0] === page)?.[1] ||
          "Reżyser sesji") as string);
  return (
    <div className={`app ${user.role === "councillor" ? "tablet-app" : ""}`}>
      {user.role !== "councillor" && (
        <aside className="sidebar">
          <Brand />
          <div className="workspace">
            <span className="workspace-icon">
              <CalendarDays size={17} />
            </span>
            <div>
              Rada Miejska w Golinie<small>Panel obsługi sesji</small>
            </div>
          </div>
          <nav>
            {nav.map((g) => (
              <div key={g.label}>
                <h2>{g.label}</h2>
                {g.items
                  .filter(
                    (n) =>
                      user.role === "admin" ||
                      [
                        "/production",
                        "/display",
                        "/admin/reports",
                        "/admin/diagnostics",
                      ].includes(n[0] as string),
                  )
                  .map(([url, label, Icon]) => (
                    <button
                      key={url as string}
                      className={
                        page === url ? "nav-item selected" : "nav-item"
                      }
                      onClick={() => go(url as string)}
                    >
                      <Icon size={18} />
                      {label as string}
                      {url === "/admin/director" && (
                        <span className="live-dot" />
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <ShieldCheck size={18} />
            <div>
              Lokalne środowisko<small>Dane pozostają na serwerze</small>
            </div>
          </div>
          <div className="profile">
            <div className="avatar">{user.name.slice(0, 1)}</div>
            <div>
              {user.name}
              <small>
                {user.role === "admin" ? "Administrator" : user.role}
              </small>
            </div>
            <button title="Wyloguj" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </aside>
      )}
      <div className="main-shell">
        <header className="topbar">
          {user.role === "councillor" ? (
            <Brand />
          ) : (
            <div className="breadcrumbs">
              GOLINA e-SESJA <ChevronRight size={14} />
              <strong>{title}</strong>
            </div>
          )}
          <div className="topbar-right">
            <span className={`connection ${online ? "" : "offline"}`}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}{" "}
              {online ? "Połączono z serwerem" : "Utracono połączenie"}
            </span>
            <span className="demo-chip">DEMO</span>
            {user.role === "councillor" && (
              <button className="icon-button" title="Wyloguj" onClick={logout}>
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="alert error">
              <AlertTriangle size={18} />
              {error}
              <button
                onClick={() => setError("")}
                aria-label="Zamknij komunikat"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}
          {!online && (
            <div role="alert" className="alert error">
              Brak połączenia. Nie wysyłaj ponownie głosu bez sprawdzenia jego
              statusu po połączeniu.
            </div>
          )}
          {user.role === "councillor" ? (
            <Councillor {...common} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CENTRUM ZARZĄDZANIA OBRADAMI</div>
                  <h1>{title}</h1>
                  <p>
                    {page === "/production"
                      ? "Podgląd emisji i bezpieczna kontrola grafiki transmisyjnej."
                      : "Wszystko, czego potrzebujesz, by sprawnie poprowadzić sesję."}
                  </p>
                </div>
                <div className="heading-actions">
                  {user.role === "admin" && (
                    <button
                      className="secondary"
                      onClick={() => setModal("session")}
                    >
                      <Plus size={17} />
                      Nowa sesja
                    </button>
                  )}
                  <span className="date-label">
                    <CalendarDays size={16} />
                    {new Date().toLocaleDateString("pl-PL", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "Europe/Warsaw",
                    })}
                  </span>
                </div>
              </div>
              {!session ? (
                <div className="empty">
                  <CalendarDays />
                  <h2>Zacznij od nowej sesji</h2>
                  <p>Dodaj sesję, punkty obrad i otwórz obecność.</p>
                </div>
              ) : (
                <>
                  <section className="session-banner">
                    <div className="session-mark">
                      <Radio size={27} />
                    </div>
                    <div className="session-info">
                      <span className="eyebrow">
                        AKTYWNA SESJA · DANE FIKCYJNE
                      </span>
                      <h2>{session.title}</h2>
                      <p>
                        {session.number}
                        <span>•</span>
                        {session.date}
                        <span>•</span>
                        {session.place}
                      </p>
                    </div>
                    <span
                      className={`status-pill ${session.status === "live" ? "green" : ""}`}
                    >
                      <span className="dot" />
                      {sessionStatuses[session.status]}
                    </span>
                  </section>
                  <div className="stats-grid">
                    <Stat
                      icon={Users}
                      label="Obecność radnych"
                      value={
                        <>
                          {present}
                          <small> / {session.statutory}</small>
                        </>
                      }
                      foot={
                        quorum ? "Kworum osiągnięte" : "Oczekiwanie na kworum"
                      }
                      tone={quorum ? "green" : "amber"}
                    />
                    <Stat
                      icon={ListOrdered}
                      label="Porządek obrad"
                      value={
                        <>
                          {active?.position || "—"}
                          <small> / {agenda.length} punktów</small>
                        </>
                      }
                      foot={active?.title || "Nie wybrano punktu"}
                    />
                    <Stat
                      icon={Vote}
                      label="Głosowania"
                      value={votes.length}
                      foot={`${votes.filter((v) => v.result).length} zatwierdzonych wyników`}
                    />
                    <Stat
                      icon={Radio}
                      label="Transmisja vMix"
                      value={
                        data.production.bridge_at &&
                        Date.now() - data.production.bridge_at < 10000
                          ? "Połączono"
                          : "Oczekuje"
                      }
                      foot={
                        data.production.mode === "AUTO"
                          ? "Automatyczna publikacja wyników"
                          : "Tryb ręczny · auto wyłączone"
                      }
                      tone={
                        data.production.bridge_at &&
                        Date.now() - data.production.bridge_at < 10000
                          ? "green"
                          : "neutral"
                      }
                    />
                  </div>
                  {page === "/production" ? (
                    <Production {...common} />
                  ) : page === "/admin/sessions" ? (
                    <section className="card">
                      <CardTitle
                        title="Sesje i kadencje"
                        subtitle="Sesje zapisane na lokalnym serwerze"
                      />
                      {data.sessions.map((s: Data) => (
                        <div className="table-row" key={s.id}>
                          <CalendarDays size={18} />
                          <strong>{s.title}</strong>
                          <span>{s.number}</span>
                          <span>{s.date}</span>
                          <span className="pill">
                            {sessionStatuses[s.status]}
                          </span>
                        </div>
                      ))}
                      <p className="muted padded">
                        W tym etapie widoki operacyjne dotyczą najnowszej sesji.
                        Historia zatwierdzonych głosowań jest dostępna w
                        eksporcie CSV.
                      </p>
                    </section>
                  ) : page === "/admin/agenda" ? (
                    <section className="card">
                      <CardTitle
                        title="Porządek obrad"
                        subtitle="Przykładowe punkty nie są oficjalnym porządkiem sesji."
                        action={
                          <button
                            className="secondary"
                            disabled={session.status !== "draft"}
                            onClick={() => setModal("agenda")}
                          >
                            <Plus size={16} />
                            Dodaj punkt
                          </button>
                        }
                      />
                      <Agenda {...common} />
                    </section>
                  ) : page === "/admin/attendance" ? (
                    <section className="card">
                      <CardTitle
                        title="Obecność radnych"
                        subtitle="Obecność i połączenie urządzenia to odrębne stany."
                        action={
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              action("/api/attendance/control", {
                                sessionId: session.id,
                                open: !session.attendance_open,
                              })
                            }
                          >
                            {session.attendance_open
                              ? "Zamknij obecność"
                              : "Otwórz obecność"}
                          </button>
                        }
                      />
                      <MemberList members={members} />
                    </section>
                  ) : page === "/admin/reports" ? (
                    <section className="card">
                      <CardTitle
                        title="Zatwierdzone wyniki"
                        subtitle="Eksport obejmuje imienne wyniki wszystkich sesji."
                        action={
                          <a
                            className="secondary button"
                            href="/api/results.csv"
                          >
                            <Download size={16} />
                            Pobierz CSV
                          </a>
                        }
                      />
                      {votes.filter((v) => v.result).length ? (
                        votes
                          .filter((v) => v.result)
                          .map((v) => (
                            <div className="report-result" key={v.id}>
                              <h3>{v.question}</h3>
                              <Result result={v.result} />
                            </div>
                          ))
                      ) : (
                        <div className="empty">
                          <FileText />
                          <p>
                            Nie ma jeszcze zatwierdzonych wyników w bieżącej
                            sesji.
                          </p>
                        </div>
                      )}
                    </section>
                  ) : page === "/admin/diagnostics" ? (
                    <Diagnostics {...common} />
                  ) : (
                    <div className="director-grid">
                      <section className="card agenda-card">
                        <CardTitle
                          title="Porządek obrad"
                          subtitle={`${agenda.length} punktów · sesja demonstracyjna`}
                          action={<ListOrdered size={17} />}
                        />
                        <Agenda {...common} />
                        <div className="card-bottom">
                          <span>
                            <span className="tiny-dot green-bg" /> Aktywny punkt
                          </span>
                          <button
                            className="text-button"
                            onClick={() => go("/admin/agenda")}
                          >
                            Zarządzaj <ArrowUpRight size={14} />
                          </button>
                        </div>
                      </section>
                      <div className="center-column">
                        <section className="card preview-card">
                          <CardTitle
                            title="Ekran prezentacyjny"
                            subtitle="Podgląd rzutnika"
                            action={
                              <button
                                className="text-button"
                                onClick={() =>
                                  window.open("/display", "_blank", "noopener")
                                }
                              >
                                Otwórz ekran <ArrowUpRight size={14} />
                              </button>
                            }
                          />
                          <div className="display-preview">
                            <div className="preview-top">
                              <span>
                                GOLINA <b>e-SESJA</b>
                              </span>
                              <span>{session.number}</span>
                            </div>
                            <div className="preview-body">
                              <span className="eyebrow">
                                RADA MIEJSKA W GOLINIE
                              </span>
                              {vote?.status === "OPEN" ? (
                                <>
                                  <span className="preview-number">
                                    <Vote size={34} />
                                  </span>
                                  <h3>Trwa głosowanie</h3>
                                  <p>{vote.question}</p>
                                  <span className="preview-sub">
                                    Zarejestrowane głosy: {vote.count} /{" "}
                                    {present}
                                  </span>
                                </>
                              ) : approved &&
                                ["APPROVED", "PUBLISHED"].includes(
                                  vote?.status,
                                ) ? (
                                <>
                                  <h3>
                                    {approved.result.passed
                                      ? "PRZYJĘTO"
                                      : "NIEPRZYJĘTO"}
                                  </h3>
                                  <p>{approved.question}</p>
                                  <MiniCounts counts={approved.result.counts} />
                                </>
                              ) : (
                                <>
                                  <span className="preview-number">
                                    {String(active?.position || 1).padStart(
                                      2,
                                      "0",
                                    )}
                                  </span>
                                  <h3>
                                    {session.status === "break"
                                      ? "Przerwa w obradach"
                                      : session.status === "ended"
                                        ? "Sesja zakończona"
                                        : active?.title ||
                                          "Oczekiwanie na rozpoczęcie"}
                                  </h3>
                                  <span className="preview-sub">
                                    {session.status === "break"
                                      ? "Prosimy o oczekiwanie"
                                      : `Punkt ${active?.position || "—"} porządku obrad`}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="preview-footer">
                              <span>
                                <span className="tiny-dot green-bg" />
                                {sessionStatuses[session.status]}
                              </span>
                              <span>
                                Obecnych: {present} / {session.statutory}
                              </span>
                            </div>
                          </div>
                          <div className="preview-caption">
                            <Monitor size={14} /> Widok 16:9{" "}
                            <span>Aktualizacja w czasie rzeczywistym</span>
                          </div>
                        </section>
                        <Voting {...common} onNew={() => setModal("vote")} />
                      </div>
                      <div className="right-column">
                        <section className="card">
                          <CardTitle
                            title="Sterowanie sesją"
                            subtitle="Reżyser sesji"
                          />
                          <div className="session-controls">
                            {session.status === "draft" ? (
                              <button
                                className="primary full"
                                disabled={busy}
                                onClick={() =>
                                  ask("Rozpocząć sesję demonstracyjną?", () =>
                                    action("/api/session/control", {
                                      sessionId: session.id,
                                      action: "start",
                                    }),
                                  )
                                }
                              >
                                <Play size={17} />
                                Rozpocznij sesję
                              </button>
                            ) : session.status === "live" ? (
                              <button
                                className="secondary full"
                                disabled={busy || vote?.status === "OPEN"}
                                onClick={() =>
                                  action("/api/session/control", {
                                    sessionId: session.id,
                                    action: "break",
                                  })
                                }
                              >
                                <Pause size={17} />
                                Przerwa w obradach
                              </button>
                            ) : session.status === "break" ? (
                              <button
                                className="primary full"
                                onClick={() =>
                                  action("/api/session/control", {
                                    sessionId: session.id,
                                    action: "resume",
                                  })
                                }
                              >
                                <Play size={17} />
                                Wznów obrady
                              </button>
                            ) : (
                              <span className="muted">
                                Sesja została zakończona.
                              </span>
                            )}
                            <button
                              className="secondary full"
                              disabled={busy || session.status === "ended"}
                              onClick={() =>
                                action("/api/attendance/control", {
                                  sessionId: session.id,
                                  open: !session.attendance_open,
                                })
                              }
                            >
                              <Users size={17} />
                              {session.attendance_open
                                ? "Zamknij listę obecności"
                                : "Otwórz listę obecności"}
                            </button>
                            {["live", "break"].includes(session.status) && (
                              <button
                                className="text-button danger"
                                disabled={busy || vote?.status === "OPEN"}
                                onClick={() =>
                                  ask(
                                    "Zakończyć sesję? Nie będzie można jej ponownie otworzyć.",
                                    () =>
                                      action("/api/session/control", {
                                        sessionId: session.id,
                                        action: "end",
                                      }),
                                  )
                                }
                              >
                                <Square size={14} />
                                Zakończ sesję
                              </button>
                            )}
                          </div>
                        </section>
                        <section className="card">
                          <CardTitle
                            title="Radni"
                            subtitle="Potwierdzona obecność"
                            action={
                              <span className="pill">
                                {present} / {session.statutory}
                              </span>
                            }
                          />
                          <MemberList members={members} />
                          <div
                            className={`quorum-note ${quorum ? "" : "amber-note"}`}
                          >
                            <ShieldCheck size={17} />
                            <div>
                              <strong>
                                {quorum ? "Kworum osiągnięte" : "Brak kworum"}
                              </strong>
                              <small>
                                Wymagane:{" "}
                                {Math.floor(session.statutory / 2) + 1} obecnych
                              </small>
                            </div>
                          </div>
                        </section>
                        <div className="help-box">
                          <CircleHelp size={19} />
                          <div>
                            Przed rozpoczęciem
                            <p>
                              Przeprowadź próbę głosowania i sprawdź połączenie
                              z vMix.
                            </p>
                            <button onClick={() => go("/admin/diagnostics")}>
                              Otwórz diagnostykę <ArrowUpRight size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="bottom-grid">
                    <section className="card">
                      <CardTitle
                        title="Ostatnie zdarzenia"
                        subtitle="Dziennik operacji serwera"
                        action={<ShieldCheck size={17} />}
                      />
                      {data.audit.length ? (
                        data.audit.slice(0, 5).map((a: Data) => (
                          <div className="event-row" key={a.seq}>
                            <div className="event-icon">
                              <Check size={14} />
                            </div>
                            <div>
                              <strong>
                                {(
                                  {
                                    DEMO_SEEDED:
                                      "Przygotowano środowisko demonstracyjne",
                                    ATTENDANCE_CHANGED:
                                      "Zaktualizowano obecność",
                                    BALLOT_RECORDED: "Zarejestrowano głos",
                                    VOTE_APPROVED: "Zatwierdzono wynik",
                                    VOTE_OPEN: "Otwarto głosowanie",
                                    VOTE_CLOSED: "Zamknięto głosowanie",
                                    AGENDA_CHANGED: "Zmieniono punkt obrad",
                                    SESSION_CONTROL: "Zmieniono stan sesji",
                                  } as Data
                                )[a.action] || a.action}
                                <small>{a.actor}</small>
                              </strong>
                            </div>
                            <time>{time(a.at)}</time>
                          </div>
                        ))
                      ) : (
                        <p className="padded muted">
                          Zdarzenia są dostępne administratorowi.
                        </p>
                      )}
                    </section>
                    <section className="card broadcast-card">
                      <div className="broadcast-icon">
                        <Radio size={25} />
                      </div>
                      <div>
                        <span className="eyebrow">GRAFIKA TRANSMISYJNA</span>
                        <h3>
                          Wynik zatwierdzony.
                          <br />
                          Gotowy do emisji.
                        </h3>
                        <p>
                          Bridge emituje aktualny wynik dopiero po
                          zatwierdzeniu. Domyślny czas nakładki: 15 sekund.
                        </p>
                        <button
                          className="secondary"
                          onClick={() => go("/production")}
                        >
                          Panel realizatora <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <span className="auto-badge">AUTO</span>
                    </section>
                  </div>
                </>
              )}
              <footer>
                <span>
                  GOLINA e-SESJA <span className="footer-divider">/</span>{" "}
                  Prototyp 0.1 · dane demonstracyjne
                </span>
                <span>
                  <ShieldCheck size={13} />
                  Wymaga audytu i odbioru przed użyciem urzędowym
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal === "vote"
              ? "Przygotuj głosowanie"
              : modal === "session"
                ? "Nowa sesja"
                : "Dodaj punkt obrad"
          }
          onClose={() => setModal(null)}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              if (modal === "vote")
                action("/api/votes", {
                  ...f,
                  sessionId: session.id,
                  agendaId: active?.id,
                });
              else if (modal === "agenda")
                action("/api/agenda", { ...f, sessionId: session.id });
              else
                action("/api/sessions", {
                  ...f,
                  statutory: Number(f.statutory),
                });
            }}
          >
            {modal === "vote" ? (
              <>
                <label>
                  Pełne pytanie głosowania
                  <textarea
                    name="question"
                    required
                    minLength={5}
                    maxLength={2000}
                    defaultValue={active?.title}
                  />
                </label>
                <label>
                  Reguła większości
                  <select name="rule">
                    {Object.entries(rules).map(([v, l]) => (
                      <option value={v} key={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="form-note">
                  Reguły są demonstracyjne i wymagają akceptacji prawnej.
                  Obecność zostaje utrwalona w chwili otwarcia.
                </p>
              </>
            ) : modal === "agenda" ? (
              <label>
                Tytuł punktu
                <textarea
                  name="title"
                  required
                  minLength={3}
                  maxLength={2000}
                />
              </label>
            ) : (
              <>
                <label>
                  Tytuł
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={200}
                    defaultValue="Sesja Rady Miejskiej w Golinie"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Numer
                    <input
                      name="number"
                      required
                      maxLength={40}
                      placeholder="np. XXIX / 2026"
                    />
                  </label>
                  <label>
                    Data
                    <input
                      type="date"
                      name="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                    />
                  </label>
                </div>
                <label>
                  Miejsce
                  <input name="place" defaultValue="Golina" maxLength={200} />
                </label>
                <label>
                  Ustawowy skład rady
                  <input
                    type="number"
                    name="statutory"
                    min="1"
                    max="100"
                    defaultValue="15"
                    required
                  />
                </label>
              </>
            )}
            <button className="primary full" disabled={busy}>
              Zapisz na serwerze <Check size={16} />
            </button>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title="Potwierdź operację" onClose={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          <div className="confirm-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>
              Anuluj
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                const r = confirm;
                setConfirm(null);
                await r.run();
              }}
            >
              Potwierdzam
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: (d: Data) => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-layout">
      <div className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">RADA MIEJSKA W GOLINIE</span>
          <h1>
            Dobra sesja
            <br />
            zaczyna się
            <br />
            od porządku.
          </h1>
          <p>
            Obrady, obecność i głosowania.
            <br />
            Jedno miejsce. Wspólny rytm pracy.
          </p>
          <div className="login-features">
            <span>
              <ShieldCheck size={18} />
              Lokalny zapis danych
            </span>
            <span>
              <Monitor size={18} />
              Osobny ekran prezentacyjny
            </span>
            <span>
              <Radio size={18} />
              Integracja z vMix
            </span>
          </div>
        </div>
        <small>GOLINA e-SESJA · prototyp demonstracyjny</small>
      </div>
      <div className="login-form">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              onLogin(await api("/api/login", f));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="login-icon">
            <ShieldCheck size={25} />
          </div>
          <span className="eyebrow">WITAJ W E-SESJI</span>
          <h2>Zaloguj się do panelu</h2>
          <p>Użyj konta przypisanego do Twojej roli.</p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <label>
            Login
            <input
              name="username"
              required
              autoComplete="username"
              placeholder="np. admin lub radny01"
            />
          </label>
          <label>
            Hasło
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Wpisz hasło"
            />
          </label>
          <button className="primary full" disabled={busy}>
            {busy ? "Logowanie…" : "Zaloguj się"}
            <ArrowUpRight size={17} />
          </button>
          <div className="login-disclaimer">
            <CircleHelp size={17} />
            <p>
              Konta tworzy administrator serwera. Dane demonstracyjne nie
              stanowią oficjalnej listy radnych ani porządku obrad.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
function Stat({ icon: Icon, label, value, foot, tone = "neutral" }: Data) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <p className={tone}>
        {tone === "green" && <CheckCircle2 size={13} />} {foot}
      </p>
    </section>
  );
}
function CardTitle({ title, subtitle, action }: Data) {
  return (
    <div className="card-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function MemberList({ members }: Data) {
  return (
    <div className="member-list">
      {members.map((m: Data, i: number) => (
        <div className="member-row" key={m.id}>
          <span className={`member-avatar ${m.present ? "present" : ""}`}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>
            {m.name}
            <small>
              {m.present
                ? "Obecny · potwierdzone"
                : "Brak potwierdzenia obecności"}
            </small>
          </span>
          {m.present ? (
            <CheckCircle2 className="green" size={15} />
          ) : (
            <Circle size={15} className="muted" />
          )}
        </div>
      ))}
    </div>
  );
}
function Agenda({ data, action, busy }: Data) {
  const s = data.session;
  return (
    <div className="agenda-list">
      {data.agenda.map((a: Data) => (
        <button
          className={`agenda-item ${s.active_agenda === a.id ? "active" : ""}`}
          key={a.id}
          disabled={busy}
          onClick={() =>
            action(
              "/api/agenda/activate",
              { agendaId: a.id },
              "Zmieniono aktualny punkt obrad.",
            )
          }
        >
          <span className="agenda-num">
            {String(a.position).padStart(2, "0")}
          </span>
          <span>
            {a.title}
            {s.active_agenda === a.id && <small>AKTUALNY PUNKT</small>}
          </span>
          {s.active_agenda === a.id && <ChevronRight size={15} />}
        </button>
      ))}
    </div>
  );
}
function Voting({ vote, busy, action, ask, onNew, active, data }: Data) {
  return (
    <section className="card voting-card">
      <CardTitle
        title="Głosowanie"
        subtitle="Zapis i zatwierdzanie wyniku"
        action={
          <button
            className="text-button"
            onClick={onNew}
            disabled={!active || data.session.status === "ended"}
          >
            <Plus size={15} />
            Nowe
          </button>
        }
      />
      {!vote ? (
        <div className="empty">
          <div className="empty-icon">
            <Vote size={26} />
          </div>
          <h3>Gotowi na kolejne głosowanie?</h3>
          <p>
            Przygotuj pytanie i wybierz właściwą
            <br />
            regułę większości.
          </p>
          <button
            className="primary"
            onClick={onNew}
            disabled={!active || data.session.status === "ended"}
          >
            <Plus size={16} />
            Przygotuj głosowanie
          </button>
        </div>
      ) : (
        <div className="voting-content">
          <span
            className={`pill ${vote.status === "OPEN" ? "green-pill" : ""}`}
          >
            {statuses[vote.status]}
          </span>
          <h3>{vote.question}</h3>
          <p className="muted rule-label">{rules[vote.rule]}</p>
          {vote.status === "OPEN" && (
            <div className="vote-progress">
              <strong>
                {vote.count}
                <small> zarejestrowanych głosów</small>
              </strong>
              <p>Wybory radnych pozostają ukryte do zamknięcia.</p>
            </div>
          )}
          {(vote.result || vote.review) && (
            <Result result={vote.result || vote.review} />
          )}
          <div className="vote-actions">
            {vote.status === "DRAFT" && (
              <button
                className="primary full"
                disabled={busy || data.session.status !== "live"}
                onClick={() =>
                  ask(
                    "Otworzyć głosowanie? Lista uprawnionych zostanie utrwalona na podstawie obecności.",
                    () => action(`/api/votes/${vote.id}/open`, {}),
                  )
                }
              >
                <Play size={16} />
                Otwórz głosowanie
              </button>
            )}
            {vote.status === "OPEN" && (
              <button
                className="danger-button full"
                disabled={busy}
                onClick={() =>
                  ask(
                    "Zamknąć głosowanie? Nowe głosy nie będą już przyjmowane.",
                    () => action(`/api/votes/${vote.id}/close`, {}),
                  )
                }
              >
                <Square size={16} />
                Zamknij głosowanie
              </button>
            )}
            {vote.status === "CLOSED" && (
              <button
                className="primary full"
                disabled={busy}
                onClick={() =>
                  ask(
                    "Zatwierdzić niezmienny wynik? Spowoduje to automatyczne zlecenie emisji w vMix, jeśli Bridge jest połączony.",
                    () =>
                      action(
                        `/api/votes/${vote.id}/approve`,
                        {},
                        "Wynik zatwierdzony. Zlecono emisję aktualnego wyniku.",
                      ),
                  )
                }
              >
                <ShieldCheck size={16} />
                Zatwierdź wynik
              </button>
            )}
            {vote.result && (
              <div className="saved-note">
                <ShieldCheck size={16} />
                Niezmienny wynik · {time(vote.result.approvedAt)}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function MiniCounts({ counts }: Data) {
  return (
    <div className="mini-counts">
      {Object.entries(counts).map(([k, v]) => (
        <div key={k} className={k}>
          <strong>{v as number}</strong>
          <span>{choices[k]}</span>
        </div>
      ))}
    </div>
  );
}
function Result({ result }: Data) {
  return (
    <div className="result">
      <div className={`result-verdict ${result.passed ? "green" : "red"}`}>
        {result.passed ? <CheckCircle2 size={19} /> : <X size={19} />}
        <strong>{result.passed ? "PRZYJĘTO" : "NIEPRZYJĘTO"}</strong>
        <span>{result.quorum ? "Kworum spełnione" : "Brak kworum"}</span>
      </div>
      <MiniCounts counts={result.counts} />
      <details>
        <summary>Imienny wykaz głosów ({result.members.length})</summary>
        <div className="result-members">
          {result.members.map((m: Data) => (
            <div key={m.id}>
              <span>{m.name}</span>
              <b className={m.choice}>{choices[m.choice]}</b>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
function Modal({ title, onClose, children }: Data) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,textarea,select,a[href]",
        ) || [],
      );
    focusable()[0]?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = focusable(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", f);
    return () => {
      window.removeEventListener("keydown", f);
      before?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Zamknij">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Councillor({ data, user, online, busy, action, vote, active }: Data) {
  const me = data.members.find((m: Data) => m.id === user.id),
    s = data.session;
  return (
    <div className="councillor">
      <div className="eyebrow">PANEL RADNEGO · DANE DEMONSTRACYJNE</div>
      <h1>
        Dzień dobry,
        <br />
        {user.name}
      </h1>
      {s ? (
        <>
          <p className="muted">
            {s.title} · {s.number}
          </p>
          <section className="card padded attendance-self">
            <div>
              <Users size={22} />
              <h2>Twoja obecność</h2>
              <p>
                {me?.present
                  ? `Potwierdzona o ${time(me.at)}`
                  : "Obecność nie została jeszcze potwierdzona."}
              </p>
            </div>
            <button
              className={me?.present ? "secondary" : "primary"}
              disabled={
                !online || busy || !s.attendance_open || vote?.status === "OPEN"
              }
              onClick={() =>
                action(
                  "/api/attendance",
                  { sessionId: s.id, present: !me?.present },
                  me?.present
                    ? "Zapisano wyjście z sesji."
                    : "Serwer potwierdził Twoją obecność.",
                )
              }
            >
              {me?.present ? "Zgłoś wyjście" : "Potwierdź obecność"}
            </button>
          </section>
          <section className="card padded">
            <span className="eyebrow">AKTUALNY PUNKT · {active?.position}</span>
            <h2>{active?.title || "Oczekiwanie na punkt obrad"}</h2>
          </section>
          <section className="card padded tablet-vote">
            {vote?.status === "OPEN" ? (
              <>
                <span className="pill green-pill">TRWA GŁOSOWANIE</span>
                <h2>{vote.question}</h2>
                <p className="muted">{rules[vote.rule]}</p>
                {vote.own ? (
                  <div className="ballot-saved">
                    <ShieldCheck size={40} />
                    <h2>Głos zapisany na serwerze</h2>
                    <strong>{choices[vote.own.choice]}</strong>
                    <p>Potwierdzenie: {time(vote.own.at)}</p>
                  </div>
                ) : (
                  <>
                    <p>
                      Wybierz jeden głos. Po zapisaniu nie można go zmienić.
                    </p>
                    <div className="ballot-buttons">
                      {["YES", "NO", "ABSTAIN"].map((c) => (
                        <button
                          className={c}
                          disabled={!online || busy || !me?.present}
                          key={c}
                          onClick={() =>
                            action(
                              `/api/votes/${vote.id}/ballots`,
                              { choice: c, requestId: crypto.randomUUID() },
                              "Serwer potwierdził transakcyjny zapis głosu.",
                            )
                          }
                        >
                          <Vote size={24} />
                          {choices[c]}
                        </button>
                      ))}
                    </div>
                    {!me?.present && (
                      <p className="amber">
                        Nie jesteś na liście obecnych utrwalonej przy otwarciu
                        głosowania.
                      </p>
                    )}
                  </>
                )}
              </>
            ) : vote?.result ? (
              <>
                <span className="eyebrow">ZATWIERDZONY WYNIK</span>
                <h2>{vote.question}</h2>
                <Result result={vote.result} />
              </>
            ) : (
              <div className="empty">
                <Clock3 size={32} />
                <h2>Oczekiwanie na głosowanie</h2>
                <p>
                  {vote?.status === "CLOSED"
                    ? "Głosowanie zamknięte. Wynik oczekuje na zatwierdzenie."
                    : "Pytanie pojawi się po otwarciu głosowania przez administratora."}
                </p>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="empty">Nie utworzono jeszcze sesji.</div>
      )}
      <footer>Potwierdzenie głosu pochodzi wyłącznie z serwera.</footer>
    </div>
  );
}
function Presentation({
  data,
  online,
  active,
  vote,
  approved,
  present,
  path,
  user,
}: Data) {
  const s = data.session;
  const result = approved?.result;
  useEffect(() => {
    if (
      !path.startsWith("/production/vmix/") ||
      !result ||
      user.role !== "graphics"
    )
      return;
    const ready = () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          api("/api/graphics/ready", {
            voteId: result.voteId,
            version: result.version,
          }).catch(() => {}),
        ),
      );
    };
    ready();
    const t = setInterval(ready, 3000);
    return () => clearInterval(t);
  }, [result?.voteId, result?.version, path, user.role]);
  const mode = path.split("/").pop(),
    graphics = path.startsWith("/production/vmix/"),
    showResults = graphics
      ? ["results", "fullscreen"].includes(mode) && result
      : result &&
        vote?.id === approved.id &&
        ["APPROVED", "PUBLISHED"].includes(vote?.status);
  return (
    <div
      className={`presentation ${graphics ? "graphics" : ""} ${mode === "lower-third" ? "lower-third" : ""}`}
    >
      <div className="presentation-content">
        <header>
          <Brand />
          <div>
            {s?.number}
            <small>{s?.date}</small>
          </div>
        </header>
        <div className="presentation-main">
          <div className="eyebrow">RADA MIEJSKA W GOLINIE · DEMONSTRACJA</div>
          {!online ? (
            <>
              <WifiOff size={50} />
              <h1>Utracono połączenie z serwerem</h1>
              <p>Dane na ekranie mogą być nieaktualne.</p>
            </>
          ) : mode === "break" || s?.status === "break" ? (
            <>
              <Clock3 size={50} />
              <h1>Przerwa w obradach</h1>
              <p>Prosimy o oczekiwanie na wznowienie sesji.</p>
            </>
          ) : s?.status === "ended" ? (
            <h1>Sesja zakończona</h1>
          ) : showResults ? (
            <>
              <h1 className={result.passed ? "green" : "red"}>
                {result.passed ? "PRZYJĘTO" : "NIEPRZYJĘTO"}
              </h1>
              <h2>{result.question}</h2>
              <MiniCounts counts={result.counts} />
              <div className="presentation-members">
                {result.members.map((m: Data) => (
                  <div className={m.choice} key={m.id}>
                    <span>{m.name}</span>
                    <strong>{choices[m.choice]}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : mode === "attendance" ? (
            <>
              <h1>
                Obecność: {present} / {s?.statutory}
              </h1>
              <MemberList members={data.members} />
            </>
          ) : mode === "agenda" ? (
            <>
              <h1>Porządek obrad</h1>
              <ol className="presentation-agenda">
                {data.agenda.map((a: Data) => (
                  <li key={a.id}>{a.title}</li>
                ))}
              </ol>
            </>
          ) : vote?.status === "OPEN" ? (
            <>
              <span className="pill green-pill">TRWA GŁOSOWANIE</span>
              <h1>{vote.question}</h1>
              <p>Oczekiwanie na zakończenie głosowania</p>
            </>
          ) : mode === "results" ? (
            <>
              <h1>Oczekiwanie na zatwierdzony wynik</h1>
              <p>Wyniki cząstkowe nie są wyświetlane.</p>
            </>
          ) : (
            <>
              <span className="presentation-number">
                {String(active?.position || 1).padStart(2, "0")}
              </span>
              <h1>{active?.title || "Witamy na sesji"}</h1>
              <p>{sessionStatuses[s?.status] || "Oczekiwanie na sesję"}</p>
            </>
          )}
        </div>
        <footer>
          <span>{sessionStatuses[s?.status]}</span>
          <span>
            Obecnych: {present} / {s?.statutory}
          </span>
          <span>GOLINA e-SESJA</span>
        </footer>
      </div>
    </div>
  );
}
function Production({ data, action, busy, approved }: Data) {
  const p = data.production;
  return (
    <div className="production-grid">
      <section className="card padded">
        <span className="eyebrow">PREVIEW · ZATWIERDZONY WYNIK</span>
        {approved ? (
          <>
            <h2>{approved.question}</h2>
            <Result result={approved.result} />
          </>
        ) : (
          <div className="empty">
            <Monitor size={35} />
            <h2>Oczekiwanie na zatwierdzenie</h2>
            <p>Zamknięcie głosowania nie uruchamia emisji.</p>
          </div>
        )}
        <p className="muted">
          Źródło Browser Input: /production/vmix/results · konto graphics
        </p>
      </section>
      <section className="card padded">
        <span className="eyebrow">PROGRAM · POTWIERDZENIE BRIDGE</span>
        <h2>{p.program_vote ? "Nakładka na antenie" : "Nakładka wyłączona"}</h2>
        <p>
          Tryb: <strong>{p.mode}</strong>
        </p>
        <p>Ostatni status: {p.bridge_status || "brak połączenia"}</p>
        <p className="muted">
          {p.bridge_at
            ? `Heartbeat: ${time(new Date(p.bridge_at).toISOString())}`
            : "Uruchom Bridge na komputerze realizatora."}
        </p>
        <div className="production-actions">
          <button
            className="danger-button full"
            disabled={busy}
            onClick={() =>
              action(
                "/api/production/control",
                { action: "hide" },
                "Zlecono awaryjne ukrycie nakładki.",
              )
            }
          >
            HIDE · Ukryj awaryjnie
          </button>
          <button
            className="secondary full"
            onClick={() =>
              action("/api/production/control", {
                action: p.mode === "AUTO" ? "manual" : "auto",
              })
            }
          >
            {p.mode === "AUTO" ? "Przełącz w tryb ręczny" : "Włącz automatykę"}
          </button>
        </div>
        <p className="form-note">
          Tryb ręczny wyłącza automatykę; emisję wykonuj lokalnie w vMix. Powrót
          do AUTO nie odtwarza zaległych wyników.
        </p>
      </section>
    </div>
  );
}
function Diagnostics({ data, online, present, quorum }: Data) {
  return (
    <section className="card">
      <CardTitle
        title="Gotowość do próby generalnej"
        subtitle="Testy sprzętowe i audyt są wymagane przed wykorzystaniem urzędowym."
      />
      {[
        ["Serwer i strumień zdarzeń", online ? "Połączono" : "Offline", online],
        [
          "Obecność i kworum",
          `${present} obecnych · ${quorum ? "kworum" : "brak kworum"}`,
          quorum,
        ],
        [
          "vMix Bridge",
          data.production.bridge_at &&
          Date.now() - data.production.bridge_at < 10000
            ? "Heartbeat aktywny"
            : "Brak aktualnego heartbeat",
          data.production.bridge_at &&
            Date.now() - data.production.bridge_at < 10000,
        ],
        [
          "Oficjalny herb i dane urzędowe",
          "Niedostarczone · dane fikcyjne",
          false,
        ],
        [
          "HTTPS, MFA, odbiór Android i Windows",
          "Wymagają konfiguracji i testów urzędowych",
          false,
        ],
        ["PDF, DOCX, import dokumentów", "Następny etap implementacji", false],
      ].map(([label, value, ok]) => (
        <div className="diagnostic-row" key={String(label)}>
          {ok ? (
            <CheckCircle2 size={20} className="green" />
          ) : (
            <AlertTriangle size={20} className="amber" />
          )}
          <strong>{label}</strong>
          <span>{value}</span>
        </div>
      ))}
    </section>
  );
}
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
createRoot(document.getElementById("root")!).render(<App />);
