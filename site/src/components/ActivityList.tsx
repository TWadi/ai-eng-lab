import { findRoadmapItem, relativeTime, type ActivityEvent } from "../activity";
import { itemXp, quizXp } from "../gamify";
import type { LabData } from "../lab";
import { href } from "../route";
import { Avatar } from "./Avatar";

interface Props {
  readonly events: readonly ActivityEvent[];
  readonly data: LabData;
}

export function eventXp(e: ActivityEvent): number {
  if (e.kind === "quiz") return quizXp(e.score, e.total);
  const item = findRoadmapItem(e.itemId);
  return item ? itemXp(item) : 0;
}

export function ActivityList({ events, data }: Props) {
  return (
    <ol className="feed">
      {events.map((e, i) => {
        const who = data.memberById(e.userId);
        const item = findRoadmapItem(e.itemId);
        const phase = e.itemId.split("-")[0];
        const perfect = e.kind === "quiz" && e.score === e.total;
        return (
          <li key={`${e.kind}-${e.userId}-${e.itemId}-${e.at}`} className={`feed-row ${e.kind}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
            <Avatar member={who} size={32} color={data.colorOf(e.userId)} />
            <span className="feed-text">
              <b>{who?.display_name || who?.github_username || "Someone"}</b>{" "}
              {e.kind === "done" ? "finished" : <>scored <span className={`score${perfect ? " perfect" : ""}`}>{e.score}/{e.total}</span> on</>}{" "}
              <a href={href({ page: "roadmap", phase })}>{item?.title ?? e.itemId}</a>
            </span>
            <span className="feed-side">
              <span className="xp-chip">+{eventXp(e)} XP</span>
              <time dateTime={e.at}>{relativeTime(e.at, data.now)}</time>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
