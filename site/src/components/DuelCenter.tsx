import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { duelTitle } from "../activity";
import { activeDuel, INVITE_TTL_MS, type Duel } from "../duels";
import type { DuelsState } from "../hooks/useDuels";
import type { Profile } from "../supabase";
import { Avatar } from "./Avatar";
import { DuelArena } from "./DuelArena";

// The race arena brings the code editor and Python runner, so it loads only when a race starts.
const RaceArena = lazy(() => import("../lab/RaceArena"));

interface Props {
  readonly me: Profile;
  readonly duels: DuelsState;
  readonly memberById: (userId: string) => Profile | undefined;
  readonly colorOf: (userId: string) => string;
  /** Incoming invites the user closed for now; the bell reopens them. */
  readonly hidden: ReadonlySet<string>;
  readonly onHide: (duelId: string) => void;
  readonly onToast: (title: string, body: string) => void;
  readonly onWin: () => void;
  readonly onSolved: ((challengeId: string) => void) | null;
}

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function notify(title: string, body: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  try {
    const n = new Notification(title, { body, tag: "ai-eng-lab-duel" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the in-page pop-up still shows.
  }
}

function itemTitle(duel: Duel): string {
  return duel.kind === "code" ? "a code race" : duelTitle(duel);
}

/** Shows whatever duel needs the user right now: an incoming challenge, a sent challenge, or the live arena. */
export function DuelCenter({ me, duels, memberById, colorOf, hidden, onHide, onToast, onWin, onSolved }: Props) {
  const now = useNow(1000);
  const current = activeDuel(duels.duels, duels.entries, me.id, new Date(now));
  // The arena stays open after the duel ends so both players see the result.
  const [arenaId, setArenaId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Map<string, Duel["status"]> | null>(null);

  const liveId = current?.state === "live" ? current.duel.id : null;
  useEffect(() => {
    // A live duel opens the arena unless the player closed it (the Duels panel offers Rejoin).
    if (liveId && arenaId !== liveId && !hidden.has(liveId)) setArenaId(liveId);
  }, [liveId, arenaId, hidden]);

  // React to changes in my duels: new challenges, accepted / declined challenges.
  useEffect(() => {
    if (!duels.loaded) return;
    const mine = duels.duels.filter((d) => d.challenger === me.id || d.opponent === me.id);
    if (seen.current === null) {
      seen.current = new Map(mine.map((d) => [d.id, d.status]));
      return;
    }
    for (const d of mine) {
      const before = seen.current.get(d.id);
      if (before === d.status) continue;
      seen.current.set(d.id, d.status);
      const rival = memberById(d.challenger === me.id ? d.opponent : d.challenger);
      const name = rival?.display_name || rival?.github_username || "Someone";
      if (d.status === "pending" && d.opponent === me.id && before === undefined) {
        notify(`${name} challenges you to a ${d.kind === "code" ? "code race" : "duel"}!`, `${itemTitle(d)} · open the lab to accept`);
        document.title = "(!) Duel challenge · AI Engineering Arena";
      } else if (d.status === "live" && d.challenger === me.id) {
        notify(`${name} accepted your duel!`, "It starts in 5 seconds. Jump in!");
      } else if (d.status === "declined" && d.challenger === me.id) {
        onToast("Challenge declined", `${name} passed on this one.`);
      }
    }
  }, [duels.loaded, duels.duels, me.id, memberById, onToast]);

  useEffect(() => {
    if (current?.state !== "invite-in") document.title = "AI Engineering Arena";
  }, [current?.state]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
  };

  const arenaDuel = arenaId ? duels.duels.find((d) => d.id === arenaId) : undefined;
  // A race that nobody solved ends as "expired"; keep its arena open so both see the outcome.
  const arenaOpen = arenaDuel && (arenaDuel.status === "live" || arenaDuel.status === "done" || (arenaDuel.kind === "code" && arenaDuel.status === "expired"));
  if (arenaDuel && arenaOpen) {
    const rivalId = arenaDuel.challenger === me.id ? arenaDuel.opponent : arenaDuel.challenger;
    const close = () => {
      if (arenaDuel.status === "live") onHide(arenaDuel.id);
      setArenaId(null);
    };
    if (arenaDuel.kind === "code") {
      return (
        <Suspense fallback={<div className="waiting-chip" role="status"><b>Loading the race…</b></div>}>
          <RaceArena
            key={arenaDuel.id}
            duel={arenaDuel}
            me={me}
            rival={memberById(rivalId)}
            duels={duels}
            entries={duels.entries}
            colorOf={colorOf}
            onClose={close}
            onWin={onWin}
            onSolved={onSolved}
          />
        </Suspense>
      );
    }
    return (
      <DuelArena
        key={arenaDuel.id}
        duel={arenaDuel}
        me={me}
        rival={memberById(rivalId)}
        itemTitle={itemTitle(arenaDuel)}
        duels={duels}
        entries={duels.entries}
        colorOf={colorOf}
        onClose={close}
        onWin={onWin}
      />
    );
  }

  if (!current || (current.state === "invite-in" && hidden.has(current.duel.id))) return null;
  const rival = memberById(current.rivalId);
  const rivalName = rival?.display_name || rival?.github_username || "Someone";
  const secondsLeft = Math.max(0, Math.ceil((new Date(current.duel.created_at).getTime() + INVITE_TTL_MS - now) / 1000));
  const left = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  if (current.state === "invite-in") {
    return (
      <div className="invite" role="alertdialog" aria-labelledby="invite-title" aria-describedby="invite-body">
        <div className="invite-card">
          <Avatar member={rival} size={64} color={colorOf(current.rivalId)} />
          <p className="eyebrow">{current.duel.kind === "code" ? "Code race" : "Duel challenge"} · {left} to answer</p>
          <h2 id="invite-title">{rivalName} challenges you!</h2>
          <p id="invite-body" className="muted">
            {current.duel.kind === "code" ? (
              <>A random coding challenge, revealed when you both start. You have 15 minutes, and the first to pass every test wins.</>
            ) : (
              <>5 questions on <b>{itemTitle(current.duel)}</b>. You both start at the same moment and have 2 minutes. Best score wins, and if it's a tie, the faster player wins.</>
            )}
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="invite-actions">
            <button type="button" className="btn btn-primary btn-big" disabled={busy} onClick={() => void act(() => duels.respond(current.duel.id, true))}>
              Accept
            </button>
            <button type="button" className="btn btn-ghost btn-big" disabled={busy} onClick={() => void act(() => duels.respond(current.duel.id, false))}>
              Decline
            </button>
            <button type="button" className="btn-link" onClick={() => onHide(current.duel.id)}>Later</button>
          </div>
        </div>
      </div>
    );
  }

  // invite-out: waiting for the other player to accept.
  return (
    <div className="waiting-chip" role="status">
      <Avatar member={rival} size={32} color={colorOf(current.rivalId)} />
      <div className="waiting-text">
        <b>Waiting for {rivalName} to accept…</b>
        <span>{itemTitle(current.duel)} · expires in {left}</span>
        {error && <span className="form-error">{error}</span>}
      </div>
      <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => void act(() => duels.cancel(current.duel.id))}>
        Cancel
      </button>
    </div>
  );
}
