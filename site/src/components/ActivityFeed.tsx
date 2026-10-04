import { useState } from "react";
import type { Profile } from "../supabase";
import { findRoadmapItem, relativeTime, type ActivityEvent } from "../activity";

interface Props {
  readonly events: readonly ActivityEvent[];
  readonly members: readonly Profile[];
  readonly now: Date;
}

const COLLAPSED = 6;

export function ActivityFeed({ events, members, now }: Props) {
  const [expanded, setExpanded] = useState(false);
  const byId = new Map(members.map((m) => [m.id, m]));
  const shown = expanded ? events : events.slice(0, COLLAPSED);

  return (
    <section className="activity" aria-label="Recent activity">
      <h2 className="section-title">Recent activity</h2>
      {events.length === 0 ? (
        <p className="muted">Nothing yet. Tick an item or take a quiz and it shows up here.</p>
      ) : (
        <ol className="feed">
          {shown.map((e) => {
            const who = byId.get(e.userId);
            const item = findRoadmapItem(e.itemId);
            return (
              <li key={`${e.kind}-${e.userId}-${e.itemId}-${e.at}`} className="feed-row">
                {who?.avatar_url ? <img src={who.avatar_url} alt="" width={24} height={24} /> : <span className="avatar-fallback tiny" />}
                <span className="feed-text">
                  <b>{who?.display_name || who?.github_username || "Someone"}</b>{" "}
                  {e.kind === "done" ? "finished" : <>scored <span className={`score-pill${e.score === e.total ? " full" : ""}`}>{e.score}/{e.total}</span> on the quiz for</>}{" "}
                  <a href={`#${e.itemId.split("-")[0]}`}>{item?.title ?? e.itemId}</a>
                </span>
                <time className="feed-time" dateTime={e.at}>{relativeTime(e.at, now)}</time>
              </li>
            );
          })}
        </ol>
      )}
      {events.length > COLLAPSED && (
        <button type="button" className="ghost small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `Show ${events.length - COLLAPSED} more`}
        </button>
      )}
    </section>
  );
}
