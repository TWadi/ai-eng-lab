import { createContext, useContext, type ReactNode } from "react";
import type { Rte } from "./ports";

const RteContext = createContext<Rte | null>(null);

/** Makes one Rte (set of ports) available to every component below it. Wired in app/. */
export function RteProvider({ rte, children }: { readonly rte: Rte; readonly children: ReactNode }) {
  return <RteContext.Provider value={rte}>{children}</RteContext.Provider>;
}

/** The ports. Components and hooks reach infrastructure only through this. */
export function useRte(): Rte {
  const rte = useContext(RteContext);
  if (!rte) throw new Error("useRte() needs an <RteProvider> above it (see app/Root.tsx).");
  return rte;
}
