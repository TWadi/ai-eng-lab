import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
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
}

export interface GradedQuiz {
  readonly score: number;
  readonly total: number;
  readonly questions: readonly GradedQuestion[];
  readonly answers: readonly number[];
}

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface QuizzesState {
  readonly results: readonly QuizResult[];
  readonly start: (item: RoadmapItem) => Promise<Outcome<OpenQuiz>>;
  readonly submit: (quizId: string, answers: readonly number[]) => Promise<Outcome<GradedQuiz>>;
}

const RESULT_COLUMNS = "id,user_id,item_id,score,total,completed_at";

function toResult(row: Record<string, unknown>): QuizResult | null {
  if (!row.completed_at || row.score === null || row.score === undefined) return null;
  return {
    id: String(row.id), user_id: String(row.user_id), item_id: String(row.item_id),
    score: Number(row.score), total: Number(row.total), completed_at: String(row.completed_at),
  };
}

async function functionError(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json();
      if (body?.error) return String(body.error);
    } catch {
      // fall through to the generic message
    }
  }
  return "Couldn't create a quiz right now. Check your connection and try again.";
}

export function useQuizzes(): QuizzesState {
  const [results, setResults] = useState<readonly QuizResult[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;

    (async () => {
      const { data, error } = await client.from("quiz_attempts").select(RESULT_COLUMNS)
        .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(300);
      if (!active) return;
      if (error) {
        console.error("Failed to load quiz results", error);
        return;
      }
      setResults((data ?? []).map(toResult).filter((r): r is QuizResult => r !== null));
    })();

    const channel = client
      .channel("quiz-changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quiz_attempts" }, (payload) => {
        const result = toResult(payload.new as Record<string, unknown>);
        if (result) setResults((cur) => [result, ...cur.filter((r) => r.id !== result.id)]);
      })
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, []);

  const start = useCallback(async (item: RoadmapItem): Promise<Outcome<OpenQuiz>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { data, error } = await supabase.functions.invoke("quiz", {
      body: { item_id: item.id, title: item.title, topics: item.topics ?? [] },
    });
    if (error) {
      console.error("Quiz function failed", error);
      return { ok: false, error: await functionError(error) };
    }
    return { ok: true, value: data as OpenQuiz };
  }, []);

  const submit = useCallback(async (quizId: string, answers: readonly number[]): Promise<Outcome<GradedQuiz>> => {
    if (!supabase) return { ok: false, error: "The site isn't connected to its database." };
    const { error: updateError } = await supabase.from("quiz_attempts").update({ answers }).eq("id", quizId);
    if (updateError) {
      console.error("Failed to submit quiz", updateError);
      return { ok: false, error: "Couldn't submit your answers. Try again." };
    }
    const { data, error } = await supabase.from("quiz_attempts").select("score,total,questions,answers").eq("id", quizId).single();
    if (error || !data) {
      console.error("Failed to load graded quiz", error);
      return { ok: false, error: "Your answers were saved, but the results didn't load. Refresh to see your score." };
    }
    return { ok: true, value: data as unknown as GradedQuiz };
  }, []);

  return { results, start, submit };
}
