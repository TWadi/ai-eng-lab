export type DuelStatus = "pending" | "live" | "done" | "declined" | "cancelled" | "expired";

export interface Duel {
  readonly id: string;
  readonly item_id: string;
  readonly challenger: string;
  readonly opponent: string;
  readonly status: DuelStatus;
  readonly winner: string | null;
  readonly created_at: string;
  readonly completed_at: string | null;
  /** Shared start time once the challenge is accepted. */
  readonly starts_at: string | null;
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
/** Must match the database (live_duels migration). */
export const INVITE_TTL_MS = 5 * 60_000;
export const DUEL_LIMIT_MS = 120_000;
export const DUEL_GRACE_MS = 15_000;

export type DuelState =
  | "invite-in" | "invite-out" | "live"
  | "won" | "lost" | "draw"
  | "declined" | "cancelled" | "expired" | "watching";

export interface DuelView {
  readonly duel: Duel;
  readonly state: DuelState;
  readonly rivalId: string;
  readonly mine: DuelEntry | undefined;
  readonly theirs: DuelEntry | undefined;
}

export function inviteExpired(duel: Duel, now: Date): boolean {
  return duel.status === "pending" && now.getTime() - new Date(duel.created_at).getTime() > INVITE_TTL_MS;
}

/** How a duel looks from one player's point of view (or a spectator's). */
export function viewDuel(duel: Duel, entries: readonly DuelEntry[], meId: string | null, now: Date): DuelView {
  const isPlayer = meId === duel.challenger || meId === duel.opponent;
  const me = isPlayer ? meId! : duel.challenger;
  const rivalId = me === duel.challenger ? duel.opponent : duel.challenger;
  const mine = entries.find((e) => e.duel_id === duel.id && e.user_id === me);
  const theirs = entries.find((e) => e.duel_id === duel.id && e.user_id === rivalId);

  const state: DuelState = (() => {
    switch (duel.status) {
      case "pending":
        if (inviteExpired(duel, now)) return "expired";
        if (!isPlayer) return "watching";
        return me === duel.opponent ? "invite-in" : "invite-out";
      case "live":
        return isPlayer ? "live" : "watching";
      case "done":
        if (!isPlayer) return "watching";
        return duel.winner === null ? "draw" : duel.winner === me ? "won" : "lost";
      default:
        return duel.status;
    }
  })();
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

/** The duel needing my attention right now: live first, then an incoming invite, then one I sent. */
export function activeDuel(duels: readonly Duel[], entries: readonly DuelEntry[], meId: string | null, now: Date): DuelView | undefined {
  if (!meId) return undefined;
  const views = duels
    .filter((d) => d.challenger === meId || d.opponent === meId)
    .map((d) => viewDuel(d, entries, meId, now));
  return views.find((v) => v.state === "live")
    ?? views.find((v) => v.state === "invite-in")
    ?? views.find((v) => v.state === "invite-out");
}
