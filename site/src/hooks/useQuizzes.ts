import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import type { QuizResult } from "../activity";
import type { RoadmapItem } from "../roadmap";

export interface QuizQuestion {
  readonly question: string;
  readonly options: readonly string[];
}

export interface GradedQuestion extends QuizQuestion {
  readonly answer_index: number;
  readonly explanation: string;
}

export interface OpenQuiz {
  readonly id: string;
  readonly questions: readonly QuizQuestion[];
  /** When the clock started (duels). */
  readonly started_at?: string;
}

export interface GradedQuiz {
  readonly score: number;
  readonly total: number;
  readonly questions: readonly GradedQuestion[];
  readonly answers: readonly number[];
}

/** What submit_quiz / submit_duel return (the answer key arrives only after submitting). */
export interface SubmitResult {
  readonly score: number;
  readonly total: number;
  readonly questions: readonly QuizQuestion[];
  readonly answers: readonly number[];
  readonly answer_indexes: readonly number[];
  readonly explanations: readonly string[];
}

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface QuizzesState {
  readonly results: readonly QuizResult[];
  /** Roadmap item ids that have questions in the bank. */
  readonly available: ReadonlySet<string>;
  readonly start: (item: RoadmapItem) => Promise<Outcome<OpenQuiz>>;
  readonly submit: (quizId: string, answers: readonly number[]) => Promise<Outcome<GradedQuiz>>;
  readonly reload: () => Promise<void>;
}

const RESULT_COLUMNS = "id,user_id,item_id,score,total,completed_at,source_duel";

function toResult(row: Record<string, unknown>): QuizResult | null {
  if (!row.completed_at || row.score === null || row.score === undefined) return null;
  return {
    id: String(row.id), user_id: String(row.user_id), item_id: String(row.item_id),
    score: Number(row.score), total: Number(row.total), completed_at: String(row.completed_at),
    source_duel: row.source_duel ? String(row.source_duel) : null,
  };
}

/** Database exceptions raised on purpose (limits, membership) carry a readable message; anything else gets a generic one. */
function quizError(err: { message?: string; code?: string } | null): string {
  if (err?.code === "P0001" && err.message) return err.message;
  return "Couldn't start a quiz right now. Check your connection and try again.";
}

export function toGraded(r: SubmitResult): GradedQuiz {
  return {
    score: r.score,
    total: r.total,
    answers: r.answers,
    questions: r.questions.map((q, i) => ({ ...q, answer_index: r.answer_indexes[i], explanation: r.explanations[i] ?? "" })),
  };
}

/** Database exceptions raised on purpose carry a readable message; anything else gets a generic one. */
export function dbError(err: { message?: string; code?: string } | null, fallback: string): string {
  return err?.code === "P0001" && err.message ? err.message : fallback;
}

export function useQuizzes(): QuizzesState {
  const [results, setResults] = useState<readonly QuizResult[]>([]);
  const reloadRef = useRef<(() => Promise<void>) | null>(null);
  const [available, setAvailable] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    const reloadResults = async () => {
      const { data, error } = await client.from("quiz_attempts").select(RESULT_COLUMNS)
        .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(500);
      if (!active) return;
      if (error) {
        console.error("Failed to load quiz results", error);
        return;
      }
      setResults((data ?? []).map(toResult).filter((r): r is QuizResult => r !== null));
    };
    reloadRef.current = reloadResults;
    void reloadResults();

    (async () => {
      const { data, error } = await client.rpc("quiz_items");
      if (!active) return;
      if (error) {
        console.error("Failed to load which items have quizzes", error);
        return;
      }
      setAvailable(new Set(((data ?? []) as { item_id: string }[]).map((r) => r.item_id)));
    })();

    let subscribedBefore = false;
    const channel = client
      .channel("quiz-changes")
      // INSERT too: a duel saves each player's answer sheet as a new, already finished attempt.
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_attempts" }, (payload) => {
        if (payload.eventType === "DELETE") return;
        const result = toResult(payload.new as Record<string, unknown>);
        if (result) setResults((cur) => [result, ...cur.filter((r) => r.id !== result.id)]);
      })
      .subscribe((status) => {
        // After a reconnect, events may have been missed: reload everything.
        if (status === "SUBSCRIBED") {
          if (subscribedBefore) void reloadResults();
          subscribedBefore = true;
        }
      });

    // Coming back to the tab (e.g. after a duel on another device): catch up.
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadResults();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      reloadRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      client.removeChannel(channel);
    };
  }, []);

  const start = useCallback(async (item: RoadmapItem): Promise<Outcome<OpenQuiz>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    // Picks 5 random questions from the bank in the database; free, no AI call.
    const { data, error } = await supabase.rpc("start_quiz", { p_item: item.id });
    if (error || !data) {
      console.error("Failed to start quiz", error);
      return { ok: false, error: quizError(error) };
    }
    return { ok: true, value: data as OpenQuiz };
  }, []);

  const submit = useCallback(async (quizId: string, answers: readonly number[]): Promise<Outcome<GradedQuiz>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    // Graded in the database (submit_quiz): the answer key is never readable from the browser.
    const { data, error } = await supabase.rpc("submit_quiz", { p_attempt: quizId, p_answers: answers });
    if (error || !data) {
      console.error("Failed to submit quiz", error);
      return { ok: false, error: "Couldn't submit your answers. Try again." };
    }
    // Don't rely on the realtime event alone: read the new score back right away.
    void reloadRef.current?.();
    return { ok: true, value: toGraded(data as SubmitResult) };
  }, []);

  /** Re-read all finished quizzes (e.g. right after a duel, whose answer sheet counts as a quiz). */
  const reload = useCallback(async () => {
    await reloadRef.current?.();
  }, []);

  return { results, available, start, submit, reload };
}
