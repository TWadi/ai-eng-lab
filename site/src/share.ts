import type { DuelRecord } from "./duels";
import { BADGES, type BadgeId, type PlayerStats } from "./gamify";
import { PHASES } from "./roadmap";

export const SITE_URL = "https://twadi.github.io/ai-eng-lab/";
export const CARD_W = 1200;
export const CARD_H = 627;

export type CardKind =
  | { readonly type: "overall" }
  | { readonly type: "badge"; readonly id: BadgeId }
  | { readonly type: "phase"; readonly id: string };

export interface CardStat {
  readonly label: string;
  readonly value: string;
  /** Double-width tile for longer text. */
  readonly wide?: boolean;
}

/** Everything a card shows, independent of how it is drawn. */
export interface CardModel {
  readonly eyebrow: string;
  readonly headline: string;
  readonly name: string;
  readonly handle: string;
  readonly sticker: { readonly top: string; readonly big: string };
  readonly stats: readonly CardStat[];
  readonly badges: readonly BadgeId[];
  /** Badge to feature large (badge cards). */
  readonly featuredBadge: BadgeId | null;
  readonly caption: string;
  readonly fileName: string;
}

export interface CardInput {
  readonly name: string;
  readonly handle: string;
  readonly stats: PlayerStats;
  readonly record: DuelRecord;
}

/** The cards this player can make right now: always the overall one, plus one per earned badge and cleared phase. */
export function availableCards(stats: PlayerStats): readonly CardKind[] {
  return [
    { type: "overall" as const },
    ...BADGES.filter((b) => stats.badges.has(b.id)).map((b) => ({ type: "badge" as const, id: b.id })),
    ...stats.phasesComplete.map((id) => ({ type: "phase" as const, id })),
  ];
}

export function cardLabel(kind: CardKind): string {
  if (kind.type === "overall") return "My progress";
  if (kind.type === "badge") return `Badge: ${BADGES.find((b) => b.id === kind.id)?.name ?? kind.id}`;
  return `Phase: ${PHASES.find((p) => p.id === kind.id)?.title ?? kind.id}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildCard(kind: CardKind, input: CardInput): CardModel {
  const { stats, record, name, handle } = input;
  const { level } = stats;
  const earned = BADGES.filter((b) => stats.badges.has(b.id)).map((b) => b.id);
  const baseStats: CardStat[] = [
    { label: "XP", value: String(stats.xp) },
    { label: "Quests", value: String(stats.itemsDone) },
    { label: "Streak", value: `${stats.streak} wk` },
    { label: "Duel wins", value: String(record.wins) },
  ];
  const common = {
    name,
    handle: `@${handle}`,
    badges: earned,
    sticker: { top: "LEVEL", big: String(level.level) },
  };
  const tags = "#AIEngineering #LearningInPublic #RAG";

  if (kind.type === "badge") {
    const badge = BADGES.find((b) => b.id === kind.id);
    const badgeName = badge?.name ?? kind.id;
    return {
      ...common,
      eyebrow: "Badge unlocked",
      headline: badgeName,
      stats: [{ label: "Earned for", value: badge?.description ?? "", wide: true }, ...baseStats.slice(0, 2)],
      featuredBadge: kind.id,
      caption:
        `Unlocked the "${badgeName}" badge (${(badge?.description ?? "").toLowerCase()}) in our AI Engineering Lab. ` +
        `Three of us are working through a 40-week path from Python to production LLM apps, with quests, quizzes and duels to keep each other going. ` +
        `Now level ${level.level}, ${level.title}, with ${stats.xp} XP.\n\n${SITE_URL}\n${tags}`,
      fileName: `ai-eng-lab-${slug(handle)}-badge-${slug(badgeName)}.png`,
    };
  }

  if (kind.type === "phase") {
    const phase = PHASES.find((p) => p.id === kind.id);
    const title = phase?.title ?? kind.id;
    return {
      ...common,
      eyebrow: "Phase cleared",
      headline: title,
      stats: [{ label: "Quests", value: String(phase?.items.length ?? 0) }, ...baseStats.filter((s) => s.label !== "Quests").slice(0, 3)],
      featuredBadge: null,
      caption:
        `Phase cleared: ${title}. ` +
        (phase ? `${phase.goal} ` : "") +
        `Next up on our 40-week AI engineering path. Level ${level.level} (${level.title}), ${stats.xp} XP so far.\n\n${SITE_URL}\n${tags}`,
      fileName: `ai-eng-lab-${slug(handle)}-phase-${slug(title)}.png`,
    };
  }

  return {
    ...common,
    eyebrow: "AI Engineering Lab",
    headline: `Level ${level.level} · ${level.title}`,
    stats: baseStats,
    featuredBadge: null,
    caption:
      `Level ${level.level} (${level.title}) in our AI Engineering Lab: ${stats.xp} XP, ${stats.itemsDone} quests done, ` +
      `${earned.length} badge${earned.length === 1 ? "" : "s"}, ${record.wins} duel win${record.wins === 1 ? "" : "s"}. ` +
      `Three friends learning AI engineering in public, from Python basics to shipping AI agents.\n\n${SITE_URL}\n${tags}`,
    fileName: `ai-eng-lab-${slug(handle)}-level-${level.level}.png`,
  };
}
