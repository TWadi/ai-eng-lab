import { findRoadmapItem, relativeTime, type ActivityEvent } from "../../logic/activity";
import { itemXp, quizXp } from "../../logic/gamify";
import { DUEL_XP } from "../../logic/duels";
import type { LabData } from "../labData";
import { href } from "../../logic/route";
import { Avatar } from "./Avatar";
import type { Profile } from "../../../bsw/supabase";
import { findChallenge } from "../../logic/lab/challenges";

export function PlayerLink({ member }: { readonly member: Profile | undefined }) {
  if (!member) return <b>Someone</b>;
  return <a className="player-link" href={href({ page: "player", player: member.github_username })}>{member.display_name || member.github_username}</a>;
}

interface Props {
  readonly events: readonly ActivityEvent[];
  readonly data: LabData;
}

export function eventXp(e: ActivityEvent): number {
  if (e.kind === "quiz") return quizXp(e.score, e.total);
  if (e.kind === "duel") return e.draw ? DUEL_XP.draw : DUEL_XP.win;
  if (e.kind === "solve") return e.xp;
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
              <PlayerLink member={who} />{" "}
              {e.kind === "solve" ? (
                <>solved the coding challenge <a href={href({ page: "lab", lab: e.challengeId })}>{e.title}</a></>
              ) : e.kind === "done" ? "finished" : e.kind === "quiz" ? (
                <>scored <span className={`score${perfect ? " perfect" : ""}`}>{e.score}/{e.total}</span> on</>
              ) : (
                <>
                  {e.draw ? "drew with" : "beat"} <PlayerLink member={data.memberById(e.rivalId)} />{" "}
                  {e.score !== null && e.rivalScore !== null && <span className="score duel-score">{e.score}–{e.rivalScore}</span>}
                  {e.challengeId ? <> in a code race on <a href={href({ page: "lab", lab: e.challengeId })}>{findChallenge(e.challengeId)?.title ?? e.challengeId}</a></> : " in a duel on"}
                </>
              )}{" "}
              {e.kind !== "solve" && !(e.kind === "duel" && e.challengeId) && <a href={href({ page: "roadmap", phase })}>{item?.title ?? e.itemId}</a>}
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
