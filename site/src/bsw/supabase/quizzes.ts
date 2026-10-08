import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuizPort } from "../../rte/ports";
import type { QuizResult } from "../../swc/logic/activity";
import { ok, type GradedQuiz, type OpenQuiz, type QuizQuestion } from "../../swc/logic/types";
import { failed } from "./errors";
import { watchTables } from "./realtime";

const RESULT_COLUMNS = "id,user_id,item_id,score,total,completed_at,source_duel";

/** What submit_quiz / submit_duel return: the answer key arrives only after submitting. */
export interface SubmitResult {
  readonly score: number;
  readonly total: number;
  readonly questions: readonly QuizQuestion[];
  readonly answers: readonly number[];
  readonly answer_indexes: readonly number[];
  readonly explanations: readonly string[];
}

export function toGraded(r: SubmitResult): GradedQuiz {
  return {
    score: r.score,
    total: r.total,
    answers: r.answers,
    questions: r.questions.map((q, i) => ({ ...q, answer_index: r.answer_indexes[i], explanation: r.explanations[i] ?? "" })),
  };
}

export function toResult(row: Record<string, unknown>): QuizResult | null {
  if (!row.completed_at || row.score === null || row.score === undefined) return null;
  return {
    id: String(row.id), user_id: String(row.user_id), item_id: String(row.item_id),
    score: Number(row.score), total: Number(row.total), completed_at: String(row.completed_at),
    source_duel: row.source_duel ? String(row.source_duel) : null,
  };
}

/** Quizzes are picked and graded in the database; the answer key never reaches the browser before submitting. */
export function supabaseQuizzes(client: SupabaseClient): QuizPort {
  return {
    async loadResults() {
      const { data, error } = await client.from("quiz_attempts").select(RESULT_COLUMNS)
        .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(500);
      if (error) return failed("Loading quiz results", error, "Couldn't load quiz results.");
      return ok((data ?? []).map(toResult).filter((r): r is QuizResult => r !== null));
    },

    async loadQuizItems() {
      const { data, error } = await client.rpc("quiz_items");
      if (error) return failed("Loading quiz items", error, "Couldn't load which lectures have quizzes.");
      return ok(((data ?? []) as { item_id: string }[]).map((r) => r.item_id));
    },

    watchResults(cb, onReconnect) {
      return watchTables(client, "quiz-changes", [{
        table: "quiz_attempts",
        // INSERT too: a duel saves each player's answer sheet as a new, already finished attempt.
        on: (p) => {
          if (p.eventType === "DELETE") return;
          const result = toResult(p.new as Record<string, unknown>);
          if (result) cb(result);
        },
      }], onReconnect);
    },

    async start(itemId) {
      const { data, error } = await client.rpc("start_quiz", { p_item: itemId });
      if (error || !data) return failed("start_quiz", error, "Couldn't start a quiz right now. Check your connection and try again.");
      return ok(data as OpenQuiz);
    },

    async submit(quizId, answers) {
      const { data, error } = await client.rpc("submit_quiz", { p_attempt: quizId, p_answers: answers });
      if (error || !data) return failed("submit_quiz", error, "Couldn't submit your answers. Try again.");
      return ok(toGraded(data as SubmitResult));
    },
  };
}
