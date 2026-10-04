export interface Duel {
  readonly id: string;
  readonly item_id: string;
  readonly challenger: string;
  readonly opponent: string;
  readonly status: "open" | "done";
  readonly winner: string | null;
  readonly created_at: string;
  readonly completed_at: string | null;
}

export interface DuelEntry {
  readonly duel_id: string;
  readonly user_id: string;
  readonly started_at: string;
  readonly submitted_at: string | null;
  readonly score: number | null;
  readonly time_ms: number | null;
}

export const DUEL_XP = { win: 15, draw: 5 } as const;

/** Open duels older than this are shown as expired and can no longer be played from the site. */
export const DUEL_TTL_DAYS = 7;

export type DuelState = "your-turn" | "waiting" | "won" | "lost" | "draw" | "expired" | "watching";

export interface DuelView {
  readonly duel: Duel;
  readonly state: DuelState;
  readonly rivalId: string;
  readonly mine: DuelEntry | undefined;
  readonly theirs: DuelEntry | undefined;
}

export function isExpired(duel: Duel, now: Date): boolean {
  return duel.status === "open" && now.getTime() - new Date(duel.created_at).getTime() > DUEL_TTL_DAYS * 86_400_000;
}

/** How a duel looks from one player's point of view (or a spectator's). */
export function viewDuel(duel: Duel, entries: readonly DuelEntry[], meId: string | null, now: Date): DuelView {
  const isPlayer = meId === duel.challenger || meId === duel.opponent;
  const me = isPlayer ? meId! : duel.challenger;
  const rivalId = me === duel.challenger ? duel.opponent : duel.challenger;
  const mine = entries.find((e) => e.duel_id === duel.id && e.user_id === me);
  const theirs = entries.find((e) => e.duel_id === duel.id && e.user_id === rivalId);

  let state: DuelState;
  if (duel.status === "done") {
    state = !isPlayer ? "watching" : duel.winner === null ? "draw" : duel.winner === me ? "won" : "lost";
  } else if (isExpired(duel, now)) {
    state = "expired";
  } else if (!isPlayer) {
    state = "watching";
  } else {
    state = mine?.submitted_at ? "waiting" : "your-turn";
  }
  return { duel, state, rivalId, mine, theirs };
}

export interface DuelRecord {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

export function duelRecord(userId: string, duels: readonly Duel[]): DuelRecord {
  const mine = duels.filter((d) => d.status === "done" && (d.challenger === userId || d.opponent === userId));
  return {
    wins: mine.filter((d) => d.winner === userId).length,
    losses: mine.filter((d) => d.winner !== null && d.winner !== userId).length,
    draws: mine.filter((d) => d.winner === null).length,
  };
}

export function duelXp(userId: string, duel: Duel): number {
  if (duel.status !== "done" || (duel.challenger !== userId && duel.opponent !== userId)) return 0;
  if (duel.winner === null) return DUEL_XP.draw;
  return duel.winner === userId ? DUEL_XP.win : 0;
}

export function formatTime(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`;
}
