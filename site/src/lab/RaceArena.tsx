import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Profile } from "../supabase";
import { DUEL_GRACE_MS, DUEL_XP, RACE_LIMIT_MS, formatTime, type Duel, type DuelEntry } from "../duels";
import type { DuelsState } from "../hooks/useDuels";
import { Avatar } from "../components/Avatar";
import { allPassed, findChallenge, type Challenge, type RunResult } from "./challenges";
import { CodeEditor } from "./CodeEditor";
import { Prose } from "./Prose";
import { preloadPython, runChallenge, type RunnerState } from "./pyRunner";
import { TestResults } from "./TestResults";

interface Props {
  readonly duel: Duel;
  readonly me: Profile;
  readonly rival: Profile | undefined;
  readonly duels: DuelsState;
  readonly entries: readonly DuelEntry[];
  readonly colorOf: (userId: string) => string;
  readonly onClose: () => void;
  readonly onWin: () => void;
  readonly onSolved: ((challengeId: string) => void) | null;
}

type Phase =
  | { readonly name: "connecting" }
  | { readonly name: "countdown"; readonly startsAt: number }
  | { readonly name: "racing"; readonly endsAt: number; readonly challenge: Challenge }
  | { readonly name: "submitting" }
  | { readonly name: "submitted" }
  | { readonly name: "error"; readonly message: string };

interface Progress {
  readonly passed: number;
  readonly total: number;
  readonly finished: boolean;
}

const DRAFT_KEY = (duelId: string) => `ai-eng-lab:race:${duelId}`;

function loadDraft(duelId: string, fallback: string): string {
  try {
    return localStorage.getItem(DRAFT_KEY(duelId)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveDraft(duelId: string, code: string): void {
  try {
    localStorage.setItem(DRAFT_KEY(duelId), code);
  } catch {
    // Storage blocked: a reload just starts from the starter code.
  }
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** After a race, both entries (with code) are readable; fetch them for the side-by-side. */
function useSolutions(duelId: string, decided: boolean): ReadonlyMap<string, string> {
  const [codes, setCodes] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    if (!decided || !supabase) return;
    let active = true;
    void supabase.from("duel_entries").select("user_id,answers").eq("duel_id", duelId).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Failed to load race solutions", error);
        return;
      }
      const rows = (data ?? []) as Array<{ user_id: string; answers: { code?: unknown } | null }>;
      setCodes(new Map(rows.flatMap((r) => (typeof r.answers?.code === "string" ? [[r.user_id, r.answers.code] as const] : []))));
    });
    return () => {
      active = false;
    };
  }, [duelId, decided]);
  return codes;
}

export default function RaceArena({ duel, me, rival, duels, entries, colorOf, onClose, onWin, onSolved }: Props) {
  const { start, submitRace, finish } = duels;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "connecting" });
  const [code, setCode] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [runner, setRunner] = useState<RunnerState>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [theirs, setTheirs] = useState<Progress>({ passed: 0, total: 0, finished: false });
  const [confirmQuit, setConfirmQuit] = useState(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const submittedRef = useRef(false);
  const retryRef = useRef<number | undefined>(undefined);
  const celebrated = useRef(false);
  const serverNow = tick + offset;
  const rivalName = rival?.display_name || rival?.github_username || "your rival";
  const decided = duel.status === "done" || duel.status === "expired";
  const won = duel.status === "done" && duel.winner === me.id;
  const solutions = useSolutions(duel.id, decided);
  const revealed = duel.challenge_id ? findChallenge(duel.challenge_id) : undefined;
  const challenge = phase.name === "racing" ? phase.challenge : revealed;

  useEffect(() => {
    dialogRef.current?.showModal();
    preloadPython();
    const t = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  // Live test progress of both players over a broadcast channel (not stored anywhere).
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`race-live-${duel.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "progress" }, ({ payload }) => {
      if (payload?.userId && payload.userId !== me.id) {
        setTheirs({ passed: Number(payload.passed) || 0, total: Number(payload.total) || 0, finished: Boolean(payload.finished) });
      }
    }).subscribe();
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      void supabase?.removeChannel(ch);
    };
  }, [duel.id, me.id]);

  const sendProgress = useCallback((passed: number, total: number, finished: boolean) => {
    void channelRef.current?.send({ type: "broadcast", event: "progress", payload: { userId: me.id, passed, total, finished } });
  }, [me.id]);

  const load = useCallback(async () => {
    const res = await start(duel.id);
    if (!res.ok) {
      // Reloaded the page after finishing: just wait for the result.
      if (/already submitted|already over/i.test(res.error)) {
        submittedRef.current = true;
        setPhase({ name: "submitted" });
      } else {
        setPhase({ name: "error", message: res.error });
      }
      return;
    }
    setOffset(res.value.serverOffset);
    if (res.value.kind === "wait") {
      setPhase({ name: "countdown", startsAt: res.value.startsAt });
      const wait = Math.max(0, res.value.startsAt - (Date.now() + res.value.serverOffset)) + 150;
      window.clearTimeout(retryRef.current);
      retryRef.current = window.setTimeout(() => void load(), wait);
      return;
    }
    if (res.value.kind !== "race") {
      setPhase({ name: "error", message: "This duel isn't a code race." });
      return;
    }
    const c = findChallenge(res.value.challengeId);
    if (!c) {
      setPhase({ name: "error", message: "This race uses a challenge your copy of the site doesn't have yet. Reload the page." });
      return;
    }
    setCode(loadDraft(duel.id, c.starter));
    setResetKey((k) => k + 1);
    setPhase({ name: "racing", endsAt: res.value.endsAt, challenge: c });
  }, [duel.id, start]);

  useEffect(() => {
    void load();
    return () => window.clearTimeout(retryRef.current);
  }, [load]);

  const send = useCallback(async (passed: boolean, finalCode: string, c: Challenge) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase({ name: "submitting" });
    const res = await submitRace(duel.id, passed, finalCode);
    if (res.ok || /already over|already finished/i.test(res.error)) {
      setPhase({ name: "submitted" });
      sendProgress(passed ? c.tests.length : 0, c.tests.length, true);
      if (passed) onSolved?.(c.id);
    } else {
      submittedRef.current = false;
      setPhase({ name: "error", message: res.error });
    }
  }, [duel.id, submitRace, sendProgress, onSolved]);

  const run = useCallback(async () => {
    if (phase.name !== "racing" || runner !== "idle" || Date.now() + offset >= phase.endsAt) return;
    const c = phase.challenge;
    const r = await runChallenge(code, c.tests, setRunner);
    setResult(r);
    const passed = r.results.filter((t) => t.ok).length;
    if (allPassed(r)) void send(true, code, c);
    else sendProgress(passed, c.tests.length, false);
  }, [phase, runner, offset, code, send, sendProgress]);

  const onChange = (next: string) => {
    setCode(next);
    saveDraft(duel.id, next);
  };

  // If the clock and grace period are over (e.g. the other player left), close the race.
  const startsAt = duel.starts_at ? new Date(duel.starts_at).getTime() : 0;
  const finishDue = !decided && startsAt > 0 && serverNow > startsAt + RACE_LIMIT_MS + DUEL_GRACE_MS;
  useEffect(() => {
    if (!finishDue) return;
    void finish(duel.id);
    const t = window.setInterval(() => void finish(duel.id), 5000);
    return () => window.clearInterval(t);
  }, [finishDue, duel.id, finish]);

  // The rival solved it first (or time ran out) while I was still coding.
  useEffect(() => {
    if (decided && phase.name !== "submitted") {
      submittedRef.current = true;
      setPhase({ name: "submitted" });
    }
  }, [decided, phase.name]);

  useEffect(() => {
    if (won && !celebrated.current) {
      celebrated.current = true;
      onWin();
    }
  }, [won, onWin]);

  const mine = entries.find((e) => e.duel_id === duel.id && e.user_id === me.id);
  const theirsEntry = entries.find((e) => e.duel_id === duel.id && e.user_id !== me.id);
  const myPassed = result ? result.results.filter((t) => t.ok).length : 0;
  const total = challenge?.tests.length ?? 0;
  const left = phase.name === "racing" ? phase.endsAt - serverNow : 0;

  return (
    <dialog ref={dialogRef} className="quiz arena race" onCancel={(e) => { if (!decided) e.preventDefault(); }} onClose={onClose} aria-labelledby="race-title">
      <header className="quiz-head duel-head">
        <div>
          <div className="ph-code">Code race</div>
          <h2 id="race-title">{challenge ? challenge.title : "Mystery challenge"}</h2>
        </div>
        {phase.name === "racing" && (
          <div className={`race-clock${left < 60_000 ? " urgent" : ""}`} role="timer" aria-label="Time left">{clock(left)}</div>
        )}
        {(decided || phase.name === "error") && (
          <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Close</button>
        )}
      </header>

      <div className="versus">
        <div className="vs-player" style={{ ["--player" as string]: colorOf(me.id) }}>
          <Avatar member={me} size={40} color={colorOf(me.id)} />
          <span className="vs-name">You</span>
          <span className="vs-progress">{phase.name === "racing" ? `${myPassed}/${total} tests` : mine?.score === 1 ? "solved" : "…"}</span>
        </div>
        <span className="vs-mark">VS</span>
        <div className="vs-player" style={{ ["--player" as string]: colorOf(rival?.id ?? "") }}>
          <Avatar member={rival} size={40} color={colorOf(rival?.id ?? "")} />
          <span className="vs-name">{rivalName}</span>
          <span className="vs-progress">
            {decided ? (theirsEntry?.score === 1 ? "solved" : "—") : theirs.finished ? "finished" : theirs.total ? `${theirs.passed}/${theirs.total} tests` : "coding…"}
          </span>
        </div>
      </div>

      {phase.name === "connecting" && <p className="quiz-status" role="status">Connecting to the race…</p>}

      {phase.name === "countdown" && (
        <div className="countdown" role="status" aria-live="assertive">
          <span>Same challenge, same moment. First to pass every test wins.</span>
          <b key={Math.ceil((phase.startsAt - serverNow) / 1000)}>{Math.max(1, Math.ceil((phase.startsAt - serverNow) / 1000))}</b>
        </div>
      )}

      {phase.name === "error" && (
        <div className="quiz-status">
          <p className="form-error" role="alert">{phase.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {phase.name === "racing" && (
        <div className="race-body">
          <section className="race-brief">
            <div className="quest-top">
              <span className={`level level-${phase.challenge.level}`}>{phase.challenge.level}</span>
            </div>
            <Prose text={phase.challenge.prompt} />
          </section>
          <section className="race-work">
            <CodeEditor value={code} onChange={onChange} onRun={() => void run()} resetKey={resetKey} />
            <div className="run-bar">
              <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={runner !== "idle" || left <= 0}>
                {left <= 0 ? "Time's up" : runner === "loading" ? "Loading Python…" : runner === "running" ? "Running…" : "Run tests"}
              </button>
              <span className="muted small-text">Ctrl + Enter</span>
              {confirmQuit ? (
                <span className="race-quit">
                  Give up?{" "}
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => void send(false, code, phase.challenge)}>Yes</button>
                  <button type="button" className="btn-link" onClick={() => setConfirmQuit(false)}>No</button>
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmQuit(true)}>Give up</button>
              )}
            </div>
            {result && <TestResults challenge={phase.challenge} result={result} />}
          </section>
        </div>
      )}

      {phase.name === "submitting" && <p className="quiz-status" role="status">Sending your result…</p>}

      {phase.name === "submitted" && (
        <div className="quiz-body">
          {!decided ? (
            <div className="duel-wait" role="status">
              <b>{mine?.score === 1 ? `Solved in ${formatTime(mine.time_ms)}` : "You're out of this one."}</b>
              <span>Waiting for {rivalName}… {theirs.total ? `${theirs.passed}/${theirs.total} tests passing` : ""}</span>
            </div>
          ) : (
            <div className={`duel-result ${duel.status === "expired" ? "draw" : won ? "won" : "lost"}`}>
              <b>{duel.status === "expired" ? "Nobody solved it" : won ? "You win!" : `${rivalName} wins`}</b>
              <span>
                {duel.status === "done" && `Solved in ${formatTime((won ? mine : theirsEntry)?.time_ms)}`}
                {won && ` · +${DUEL_XP.win} XP`}
              </span>
            </div>
          )}
          {decided && (
            <div className="race-solutions">
              {[me.id, rival?.id ?? ""].map((uid) => (
                <figure key={uid}>
                  <figcaption>{uid === me.id ? "Your code" : `${rivalName}'s code`}</figcaption>
                  <pre>{solutions.get(uid) ?? "(no code sent)"}</pre>
                </figure>
              ))}
            </div>
          )}
          {decided && (
            <div className="quiz-foot">
              <span />
              <button type="button" className="btn btn-primary" onClick={() => dialogRef.current?.close()}>Done</button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
