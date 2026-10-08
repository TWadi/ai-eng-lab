// Domain types shared by every layer. Pure data: no React, no database, no browser APIs.

/** Result of any operation that can fail with a message meant for the player. */
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export function ok<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: string): Outcome<T> {
  return { ok: false, error };
}

/** A signed-in GitHub user. Members (players) are visible to everyone; others only to themselves. */
export interface Profile {
  readonly id: string;
  readonly github_username: string;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly is_member: boolean;
  /** Can let players in, decline or remove them. */
  readonly is_admin?: boolean;
}

/** Who is signed in, independent of the auth provider. */
export interface AuthSession {
  readonly userId: string;
}

export interface ChallengeSolve {
  readonly user_id: string;
  readonly challenge_id: string;
  readonly solved_at: string;
}

// ── Quizzes ──────────────────────────────────────────────────────────────────────────────────────────
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

// ── Duels and races ──────────────────────────────────────────────────────────────────────────────────
/** Opening a duel gives a countdown (before the shared start), the questions (quiz) or the challenge (race). */
export type DuelStart =
  | { readonly kind: "wait"; readonly startsAt: number; readonly serverOffset: number }
  | { readonly kind: "play"; readonly startsAt: number; readonly endsAt: number; readonly serverOffset: number; readonly questions: readonly QuizQuestion[] }
  | { readonly kind: "race"; readonly startsAt: number; readonly endsAt: number; readonly serverOffset: number; readonly challengeId: string };

export interface DuelGraded extends GradedQuiz {
  readonly time_ms: number;
}

export interface RaceSubmitted {
  readonly score: number;
  readonly time_ms: number;
}

// ── Players (admin) ──────────────────────────────────────────────────────────────────────────────────
export interface WaitingPlayer {
  readonly github_username: string;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly signed_in_at: string;
}

export interface PlayersOverview {
  /** Signed in with GitHub but not a player yet. */
  readonly waiting: readonly WaitingPlayer[];
  /** Signed in but turned down (they can still be let in later). */
  readonly declined: readonly WaitingPlayer[];
  /** Invited GitHub usernames that haven't signed in yet. */
  readonly invited: readonly string[];
}
