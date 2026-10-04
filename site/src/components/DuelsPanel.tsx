import { findRoadmapItem, relativeTime } from "../activity";
import { formatTime, viewDuel, type DuelState, type DuelView } from "../duels";
import type { LabData } from "../lab";
import { Avatar } from "./Avatar";
import { PlayerLink } from "./ActivityList";

const LABEL: Record<DuelState, string> = {
  "your-turn": "Your turn",
  waiting: "Waiting",
  won: "Won",
  lost: "Lost",
  draw: "Draw",
  expired: "Expired",
  watching: "",
};

function DuelRow({ v, data }: { readonly v: DuelView; readonly data: LabData }) {
  const item = findRoadmapItem(v.duel.item_id);
  const rival = data.memberById(v.rivalId);
  const decided = v.state === "won" || v.state === "lost" || v.state === "draw";
  return (
    <li className={`duel-row state-${v.state}`}>
      <Avatar member={rival} size={32} color={data.colorOf(v.rivalId)} />
      <div className="duel-main">
        <div className="duel-line">
          <span>vs</span> <PlayerLink member={rival} />
          <span className={`duel-state state-${v.state}`}>{LABEL[v.state]}</span>
        </div>
        <div className="duel-sub">
          {item?.title ?? v.duel.item_id}
          {decided && v.mine?.score !== null && v.theirs?.score !== null && (
            <> · <b>{v.mine?.score}–{v.theirs?.score}</b> ({formatTime(v.mine?.time_ms)} vs {formatTime(v.theirs?.time_ms)})</>
          )}
          {v.state === "waiting" && <> · you scored {v.mine?.score}/5, waiting for {rival?.github_username ?? "them"}</>}
        </div>
      </div>
      <div className="duel-side">
        {v.state === "your-turn" && data.onPlayDuel ? (
          <button type="button" className="btn btn-primary btn-small" onClick={() => data.onPlayDuel?.(v.duel.id)}>
            {v.mine ? "Resume" : "Play"}
          </button>
        ) : (
          <time dateTime={v.duel.completed_at ?? v.duel.created_at}>{relativeTime(v.duel.completed_at ?? v.duel.created_at, data.now)}</time>
        )}
      </div>
    </li>
  );
}

export function DuelsPanel({ data }: { readonly data: LabData }) {
  const { me } = data;
  if (!me?.is_member) return null;
  const mine = data.duels
    .filter((d) => d.challenger === me.id || d.opponent === me.id)
    .map((d) => viewDuel(d, data.duelEntries, me.id, data.now));
  const toPlay = mine.filter((v) => v.state === "your-turn");
  const others = mine.filter((v) => v.state !== "your-turn").slice(0, 5);

  return (
    <section className="panel duels-panel" aria-labelledby="duels-title">
      <div className="panel-head">
        <h2 id="duels-title" className="panel-title">Duels</h2>
        {toPlay.length > 0 && <span className="duel-badge">{toPlay.length} to play</span>}
      </div>
      {mine.length === 0 ? (
        <p className="empty">No duels yet. Hit <b>Duel</b> on any RAG video in the Roadmap to challenge a friend.</p>
      ) : (
        <ul className="duel-list">
          {[...toPlay, ...others].map((v) => <DuelRow key={v.duel.id} v={v} data={data} />)}
        </ul>
      )}
    </section>
  );
}
