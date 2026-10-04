import { useEffect, useState } from "react";
import { PHASES } from "./roadmap";

export type Page = "dashboard" | "roadmap" | "activity";

export interface Route {
  readonly page: Page;
  /** Selected phase on the roadmap page. */
  readonly phase?: string;
}

const PHASE_IDS = new Set(PHASES.map((p) => p.id));

/** "#/roadmap/rag" -> roadmap + phase. Old links like "#p3" or "#rag" still open that phase. */
export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const [first, second] = clean.split("/");
  if (PHASE_IDS.has(first)) return { page: "roadmap", phase: first };
  if (first === "roadmap") return { page: "roadmap", phase: PHASE_IDS.has(second) ? second : undefined };
  if (first === "activity") return { page: "activity" };
  return { page: "dashboard" };
}

export function href(route: Route): string {
  if (route.page === "dashboard") return "#/";
  return route.phase ? `#/${route.page}/${route.phase}` : `#/${route.page}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
