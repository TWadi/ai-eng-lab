import type { QuizResult } from "../logic/activity";
import type { PlayerStats } from "../logic/gamify";
import type { ProgressByUser } from "../logic/progress";
import type { RoadmapItem } from "../logic/roadmap";
import type { Profile } from "../../bsw/supabase";
import type { Duel, DuelEntry } from "../logic/duels";
import type { ChallengeSolve } from "../../rte/useSolves";
import type { Outcome } from "../../rte/useQuizzes";

/** Everything the pages need, computed once in App. */
export interface LabData {
  readonly members: readonly Profile[];
  readonly progress: ProgressByUser;
  readonly quizResults: readonly QuizResult[];
  readonly quizAvailable: ReadonlySet<string>;
  readonly stats: ReadonlyMap<string, PlayerStats>;
  readonly ranked: readonly PlayerStats[];
  readonly me: Profile | null;
  readonly now: Date;
  readonly loading: boolean;
  readonly colorOf: (userId: string) => string;
  readonly memberById: (userId: string) => Profile | undefined;
  readonly onToggle: ((itemId: string, done: boolean, el: Element | null) => void) | null;
  readonly onQuiz: ((item: RoadmapItem) => void) | null;
  readonly duels: readonly Duel[];
  readonly duelEntries: readonly DuelEntry[];
  /** Challenge someone on an item (members only). */
  readonly onDuel: ((item: RoadmapItem) => void) | null;
  /** Open a duel to play it. */
  readonly onPlayDuel: ((duelId: string) => void) | null;
  readonly solves: readonly ChallengeSolve[];
  /** Re-read the player list after an admin invites or removes someone. */
  readonly onPlayersChanged: () => void;
  /** Called when the signed-in member passes every test of a challenge. */
  readonly onSolved: ((challengeId: string) => void) | null;
  /** Challenge a member to a code race on a random challenge (members only). */
  readonly onRace: ((opponentId: string) => Promise<Outcome<string>>) | null;
}

export const PLAYER_COLORS = ["var(--cobalt)", "var(--tomato)", "var(--mint)", "var(--sun)", "var(--pink)"] as const;
