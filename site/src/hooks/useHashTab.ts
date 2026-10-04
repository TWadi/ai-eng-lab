import { useEffect, useState } from "react";

export type Tab = "roadmap" | "notes";

export function tabFromHash(hash: string): Tab {
  return hash === "#notes" || hash.startsWith("#notes/") ? "notes" : "roadmap";
}

/** The active tab lives in the URL hash so it survives refreshes and can be linked to. */
export function useHashTab(): Tab {
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash));

  useEffect(() => {
    const onChange = () => {
      const next = tabFromHash(window.location.hash);
      setTab(next);
      // Phase anchors (#p3, #rag) only exist once the roadmap has rendered, so scroll after the switch.
      if (next === "roadmap" && /^#(p\d|rag)$/.test(window.location.hash)) {
        requestAnimationFrame(() => document.querySelector(window.location.hash)?.scrollIntoView());
      }
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return tab;
}
