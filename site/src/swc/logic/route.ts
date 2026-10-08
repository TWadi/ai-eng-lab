import { PHASES } from "./roadmap";

export type Page = "dashboard" | "roadmap" | "activity" | "player" | "lab";

export interface Route {
  readonly page: Page;
  /** Selected phase on the roadmap page. */
  readonly phase?: string;
  /** GitHub username on the player page. */
  readonly player?: string;
  /** Lab sub-page: a challenge id or "playground". */
  readonly lab?: string;
}

const PHASE_IDS = new Set(PHASES.map((p) => p.id));
const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** "#/roadmap/rag" -> roadmap + phase. Old links like "#p3" or "#rag" still open that phase. */
export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const [first, second] = clean.split("/");
  if (PHASE_IDS.has(first)) return { page: "roadmap", phase: first };
  if (first === "roadmap") return { page: "roadmap", phase: PHASE_IDS.has(second) ? second : undefined };
  if (first === "activity") return { page: "activity" };
  if (first === "player" && second && GITHUB_NAME.test(second)) return { page: "player", player: second };
  if (first === "lab") return second && /^[a-z0-9-]{1,40}$/.test(second) ? { page: "lab", lab: second } : { page: "lab" };
  return { page: "dashboard" };
}

export function href(route: Route): string {
  if (route.page === "dashboard") return "#/";
  if (route.page === "player") return `#/player/${route.player ?? ""}`;
  if (route.page === "lab") return route.lab ? `#/lab/${route.lab}` : "#/lab";
  return route.phase ? `#/${route.page}/${route.phase}` : `#/${route.page}`;
}
