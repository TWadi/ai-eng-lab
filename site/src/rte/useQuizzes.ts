import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizResult } from "../swc/logic/activity";
import type { RoadmapItem } from "../swc/logic/roadmap";
import type { GradedQuiz, OpenQuiz, Outcome } from "../swc/logic/types";
import { useRte } from "./RteContext";

export interface QuizzesState {
  readonly results: readonly QuizResult[];
  /** Roadmap item ids that have questions in the bank. */
  readonly available: ReadonlySet<string>;
  readonly start: (item: RoadmapItem) => Promise<Outcome<OpenQuiz>>;
  readonly submit: (quizId: string, answers: readonly number[]) => Promise<Outcome<GradedQuiz>>;
  /** Re-read all finished quizzes (e.g. right after a duel, whose answer sheet counts as a quiz). */
  readonly reload: () => Promise<void>;
}

export function useQuizzes(): QuizzesState {
  const { quizzes } = useRte();
  const [results, setResults] = useState<readonly QuizResult[]>([]);
  const [available, setAvailable] = useState<ReadonlySet<string>>(new Set());
  const activeRef = useRef(true);

  const reload = useCallback(async () => {
    const res = await quizzes.loadResults();
    if (activeRef.current && res.ok) setResults(res.value);
  }, [quizzes]);

  useEffect(() => {
    activeRef.current = true;
    void reload();
    void quizzes.loadQuizItems().then((res) => {
      if (activeRef.current && res.ok) setAvailable(new Set(res.value));
    });
    const stop = quizzes.watchResults(
      (result) => setResults((cur) => [result, ...cur.filter((r) => r.id !== result.id)]),
      () => void reload(),
    );
    // Coming back to the tab (e.g. after a duel on another device): catch up.
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [quizzes, reload]);

  const start = useCallback((item: RoadmapItem) => quizzes.start(item.id), [quizzes]);

  const submit = useCallback(async (quizId: string, answers: readonly number[]) => {
    const res = await quizzes.submit(quizId, answers);
    // Don't rely on the realtime event alone: read the new score back right away.
    if (res.ok) void reload();
    return res;
  }, [quizzes, reload]);

  return { results, available, start, submit, reload };
}
