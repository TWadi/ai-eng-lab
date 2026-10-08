import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Profile } from "../../../bsw/supabase";
import { DUEL_GRACE_MS, DUEL_LIMIT_MS, DUEL_XP, formatTime, type Duel, type DuelEntry } from "../../logic/duels";
import type { DuelGraded, DuelsState } from "../../../rte/useDuels";
import type { QuizQuestion } from "../../../rte/useQuizzes";
import { Avatar } from "./Avatar";

interface Props {
  readonly duel: Duel;
  readonly me: Profile;
  readonly rival: Profile | undefined;
  readonly itemTitle: string;
  readonly duels: DuelsState;
  readonly entries: readonly DuelEntry[];
  readonly colorOf: (userId: string) => string;
  readonly onClose: () => void;
  readonly onWin: () => void;
}

type Phase =
  | { readonly name: "connecting" }
  | { readonly name: "countdown"; readonly startsAt: number }
  | { readonly name: "playing"; readonly endsAt: number; readonly questions: readonly QuizQuestion[] }
  | { readonly name: "submitting" }
  | { readonly name: "submitted" }
  | { readonly name: "error"; readonly message: string };

interface Progress {
  readonly answered: number;
  readonly submitted: boolean;
}

const LETTERS = ["A", "B", "C", "D"];

export function DuelArena({ duel, me, rival, itemTitle, duels, entries, colorOf, onClose, onWin }: Props) {
  const { start, submit: submitDuel, finish } = duels;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ name: "connecting" });
  const [answers, setAnswers] = useState<readonly (number | null)[]>([]);
  const [graded, setGraded] = useState<DuelGraded | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [theirProgress, setTheirProgress] = useState<Progress>({ answered: 0, submitted: false });
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const submittedRef = useRef(false);
  const retryRef = useRef<number | undefined>(undefined);
  const celebrated = useRef(false);
  const serverNow = tick + offset;
  const rivalName = rival?.display_name || rival?.github_username || "your rival";
  const done = duel.status === "done";

  useEffect(() => {
    dialogRef.current?.showModal();
    const t = window.setInterval(() => setTick(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);

  // Live progress of both players over a broadcast channel (not stored anywhere).
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`duel-live-${duel.id}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "progress" }, ({ payload }) => {
      if (payload?.userId && payload.userId !== me.id) {
        setTheirProgress({ answered: Number(payload.answered) || 0, submitted: Boolean(payload.submitted) });
      }
    }).subscribe();
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
      void supabase?.removeChannel(ch);
    };
  }, [duel.id, me.id]);

  const sendProgress = useCallback((answered: number, submitted: boolean) => {
    void channelRef.current?.send({ type: "broadcast", event: "progress", payload: { userId: me.id, answered, submitted } });
  }, [me.id]);

  const load = useCallback(async () => {
    const res = await start(duel.id);
    if (!res.ok) {
      // Reloaded the page after submitting: just wait for the result.
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
    } else if (res.value.kind === "play") {
      const { questions, endsAt } = res.value;
      setAnswers((cur) => (cur.length === questions.length ? cur : questions.map(() => null)));
      setPhase({ name: "playing", endsAt, questions });
    }
  }, [duel.id, start]);

  useEffect(() => {
    void load();
    return () => window.clearTimeout(retryRef.current);
  }, [load]);

  const submit = useCallback(async (final: readonly (number | null)[]) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setPhase({ name: "submitting" });
    const res = await submitDuel(duel.id, final.map((a) => (a === null ? -1 : a)));
    if (res.ok) {
      setGraded(res.value);
      setPhase({ name: "submitted" });
      sendProgress(final.filter((a) => a !== null).length, true);
    } else if (/already over/i.test(res.error)) {
      setPhase({ name: "submitted" });
    } else {
      submittedRef.current = false;
      setPhase({ name: "error", message: res.error });
    }
  }, [duel.id, submitDuel, sendProgress]);

  // Out of time: submit whatever is answered.
  useEffect(() => {
    if (phase.name === "playing" && serverNow >= phase.endsAt) void submit(answers);
  }, [phase, serverNow, answers, submit]);

  // If the other player vanished, close the duel once the clock and grace period are over.
  const startsAt = duel.starts_at ? new Date(duel.starts_at).getTime() : 0;
  const finishDue = !done && startsAt > 0 && serverNow > startsAt + DUEL_LIMIT_MS + DUEL_GRACE_MS;
  useEffect(() => {
    if (!finishDue) return;
    void finish(duel.id);
    const t = window.setInterval(() => void finish(duel.id), 5000);
    return () => window.clearInterval(t);
  }, [finishDue, duel.id, finish]);

  const won = done && duel.winner === me.id;
  useEffect(() => {
    if (won && !celebrated.current) {
      celebrated.current = true;
      onWin();
    }
  }, [won, onWin]);

  const choose = (qi: number, oi: number) => {
    const next = answers.map((a, i) => (i === qi ? oi : a));
    setAnswers(next);
    sendProgress(next.filter((a) => a !== null).length, false);
  };

  const mine = entries.find((e) => e.duel_id === duel.id && e.user_id === me.id);
  const theirs = entries.find((e) => e.duel_id === duel.id && e.user_id !== me.id);
  const myScore = graded?.score ?? mine?.score ?? null;
  const myTime = graded?.time_ms ?? mine?.time_ms ?? null;
  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <dialog ref={dialogRef} className="quiz arena" onCancel={(e) => { if (!done) e.preventDefault(); }} onClose={onClose} aria-labelledby="arena-title">
      <header className="quiz-head duel-head">
        <div>
          <div className="ph-code">Live duel</div>
          <h2 id="arena-title">{itemTitle}</h2>
        </div>
        {done && <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Close</button>}
      </header>

      <div className="versus">
        <div className="vs-player" style={{ ["--player" as string]: colorOf(me.id) }}>
          <Avatar member={me} size={40} color={colorOf(me.id)} />
          <span className="vs-name">You</span>
          <span className="vs-progress">{phase.name === "playing" ? `${answeredCount}/5` : myScore !== null ? `${myScore} pts` : "…"}</span>
        </div>
        <span className="vs-mark">VS</span>
        <div className="vs-player" style={{ ["--player" as string]: colorOf(rival?.id ?? "") }}>
          <Avatar member={rival} size={40} color={colorOf(rival?.id ?? "")} />
          <span className="vs-name">{rivalName}</span>
          <span className="vs-progress">
            {done && theirs?.score !== null && theirs?.score !== undefined ? `${theirs.score} pts` : theirProgress.submitted ? "done" : `${theirProgress.answered}/5`}
          </span>
        </div>
      </div>

      {phase.name === "connecting" && <p className="quiz-status" role="status">Connecting to the duel…</p>}

      {phase.name === "countdown" && (
        <div className="countdown" role="status" aria-live="assertive">
          <span>Starting in</span>
          <b key={Math.ceil((phase.startsAt - serverNow) / 1000)}>{Math.max(1, Math.ceil((phase.startsAt - serverNow) / 1000))}</b>
        </div>
      )}

      {phase.name === "error" && (
        <div className="quiz-status">
          <p className="form-error" role="alert">{phase.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>Try again</button>
          <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>Leave</button>
        </div>
      )}

      {phase.name === "playing" && (
        <form className="quiz-body" onSubmit={(e) => { e.preventDefault(); void submit(answers); }}>
          <div className={`duel-timer${phase.endsAt - serverNow < 20_000 ? " urgent" : ""}`} role="timer" aria-label="Time left">
            <i style={{ width: `${Math.max(0, Math.min(100, ((phase.endsAt - serverNow) / DUEL_LIMIT_MS) * 100))}%` }} />
            <span>{Math.max(0, Math.ceil((phase.endsAt - serverNow) / 1000))}s</span>
          </div>
          {phase.questions.map((q, qi) => (
            <fieldset key={qi} className="quiz-q">
              <legend><span className="quiz-num">{qi + 1}</span>{q.question}</legend>
              {q.options.map((opt, oi) => (
                <label key={oi} className={`quiz-opt${answers[qi] === oi ? " picked" : ""}`}>
                  <input type="radio" name={`dq${qi}`} checked={answers[qi] === oi} onChange={() => choose(qi, oi)} />
                  <span className="quiz-letter">{LETTERS[oi]}</span>
                  <span>{opt}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <div className="quiz-foot">
            <span className="muted">{answeredCount === 5 ? "All answered." : `${5 - answeredCount} left. Unanswered count as wrong.`}</span>
            <button type="submit" className="btn btn-primary">Lock in answers</button>
          </div>
        </form>
      )}

      {phase.name === "submitting" && <p className="quiz-status" role="status">Locking in…</p>}

      {phase.name === "submitted" && (
        <div className="quiz-body">
          {!done ? (
            <div className="duel-wait" role="status">
              <b>{myScore !== null ? `${myScore}/5 in ${formatTime(myTime)}` : "Answers locked in."}</b>
              <span>Waiting for {rivalName}… {theirProgress.submitted ? "they're done, deciding…" : `${theirProgress.answered}/5 answered`}</span>
            </div>
          ) : (
            <div className={`duel-result ${duel.winner === null ? "draw" : won ? "won" : "lost"}`}>
              <b>{duel.winner === null ? "Draw!" : won ? "You win!" : `${rivalName} wins`}</b>
              <span>
                {myScore ?? "?"}–{theirs?.score ?? "?"} · {formatTime(myTime)} vs {formatTime(theirs?.time_ms)}
                {duel.winner === null ? ` · +${DUEL_XP.draw} XP` : won ? ` · +${DUEL_XP.win} XP` : ""}
              </span>
            </div>
          )}
          {graded?.questions.map((q, qi) => {
            const picked = graded.answers[qi];
            const right = picked === q.answer_index;
            return (
              <div key={qi} className={`quiz-q graded ${right ? "right" : "wrong"}`}>
                <p className="quiz-legend"><span className="quiz-num">{qi + 1}</span>{q.question}</p>
                <p className="quiz-line">
                  <b>{right ? "Correct" : picked === -1 ? "Skipped" : "Not quite"}</b>
                  {!right && picked >= 0 && <> · you picked {LETTERS[picked]}: {q.options[picked]}</>}
                </p>
                <p className="quiz-line">Answer {LETTERS[q.answer_index]}: {q.options[q.answer_index]}</p>
                <p className="quiz-expl">{q.explanation}</p>
              </div>
            );
          })}
          {done && (
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
