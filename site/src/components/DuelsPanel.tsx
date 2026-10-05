import { duelTitle, relativeTime } from "../activity";
import { formatTime, viewDuel, type DuelState, type DuelView } from "../duels";
import type { LabData } from "../lab";
import { href } from "../route";
import { Avatar } from "./Avatar";
import { PlayerLink } from "./ActivityList";

const LABEL: Record<DuelState, string> = {
  "invite-in": "Challenge!",
  "invite-out": "Sent",
  live: "Live now",
  won: "Won",
  lost: "Lost",
  draw: "Draw",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  watching: "",
};

function DuelRow({ v, data }: { readonly v: DuelView; readonly data: LabData }) {
  const rival = data.memberById(v.rivalId);
  const decided = v.state === "won" || v.state === "lost" || v.state === "draw";
  const at = v.duel.completed_at ?? v.duel.created_at;
  return (
    <li className={`duel-row state-${v.state}`}>
      <Avatar member={rival} size={32} color={data.colorOf(v.rivalId)} />
      <div className="duel-main">
        <div className="duel-line">
          <span>vs</span> <PlayerLink member={rival} />
          <span className={`duel-state state-${v.state}`}>{LABEL[v.state]}</span>
        </div>
        <div className="duel-sub">
          {duelTitle(v.duel)}
          {decided && v.duel.kind === "quiz" && v.mine?.score !== null && v.theirs?.score !== null && (
            <> · <b>{v.mine?.score ?? "–"}–{v.theirs?.score ?? "–"}</b> ({formatTime(v.mine?.time_ms)} vs {formatTime(v.theirs?.time_ms)})</>
          )}
        </div>
      </div>
      <div className="duel-side">
        {(v.state === "invite-in" || v.state === "live") && data.onPlayDuel ? (
          <button type="button" className="btn btn-primary btn-small" onClick={() => data.onPlayDuel?.(v.duel.id)}>
            {v.state === "live" ? "Rejoin" : "Answer"}
          </button>
        ) : (
          <time dateTime={at}>{relativeTime(at, data.now)}</time>
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
  const urgent = mine.filter((v) => v.state === "invite-in" || v.state === "live");
  const recent = mine.filter((v) => ["won", "lost", "draw", "declined", "invite-out"].includes(v.state)).slice(0, 5);

  return (
    <section className="panel duels-panel" aria-labelledby="duels-title">
      <div className="panel-head">
        <h2 id="duels-title" className="panel-title">Duels</h2>
        {urgent.some((v) => v.state === "invite-in") && <span className="duel-badge">Challenge waiting</span>}
      </div>
      {urgent.length + recent.length === 0 ? (
        <p className="empty">
          No duels yet. On the <a href={href({ page: "roadmap" })}>Roadmap</a>, hit <b>Duel</b> on any RAG video to challenge a friend, or start a <a href={href({ page: "lab" })}>code race</a> in the Lab. They get a notification, and once they accept you both play at the same moment.
        </p>
      ) : (
        <ul className="duel-list">
          {[...urgent, ...recent].map((v) => <DuelRow key={v.duel.id} v={v} data={data} />)}
        </ul>
      )}
    </section>
  );
}
