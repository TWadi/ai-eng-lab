import type { QuizResult } from "./activity";
import type { PlayerStats } from "./gamify";
import type { ProgressByUser } from "./progress";
import type { RoadmapItem } from "./roadmap";
import type { Profile } from "./supabase";

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
}

export const PLAYER_COLORS = ["var(--cobalt)", "var(--tomato)", "var(--mint)", "var(--sun)", "var(--pink)"] as const;
