import { BADGES, type PlayerStats } from "../gamify";
import type { Profile } from "../supabase";
import { Avatar } from "./Avatar";
import { BadgeIcon } from "./BadgeIcon";

interface Props {
  readonly member: Profile;
  readonly stats: PlayerStats;
  readonly rank: number;
  readonly color: string;
  readonly isMe: boolean;
  readonly delay: number;
}

const RANK_LABEL = ["1st", "2nd", "3rd"];

export function PlayerCard({ member, stats, rank, color, isMe, delay }: Props) {
  const { level } = stats;
  const pct = Math.round(level.progress * 100);
  const earned = BADGES.filter((b) => stats.badges.has(b.id));

  return (
    <article className={`player rank-${rank}`} style={{ ["--player" as string]: color, animationDelay: `${delay}ms` }}>
      <div className="player-rank" aria-label={`Rank ${rank}`}>{RANK_LABEL[rank - 1] ?? `${rank}th`}</div>
      <div className="player-head">
        <Avatar member={member} size={64} color={color} />
        <div className="player-id">
          <div className="player-name">
            {member.display_name || member.github_username}
            {isMe && <span className="tag-you">you</span>}
          </div>
          <div className="player-title">Lv {level.level} · {level.title}</div>
        </div>
      </div>

      <div className="xp">
        <div className="xp-row">
          <span className="xp-total">{stats.xp}<small> XP</small></span>
          <span className="xp-next">{level.nextXp - stats.xp} to Lv {level.level + 1}</span>
        </div>
        <div className="xp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="player-stats">
        <div><dt>XP this wk</dt><dd>+{stats.weekXp}</dd></div>
        <div><dt>Streak</dt><dd className={stats.streak >= 2 ? "hot" : ""}>{stats.streak} wk</dd></div>
        <div><dt>Done</dt><dd>{stats.itemsDone}</dd></div>
      </dl>

      <div className="player-badges" aria-label="Badges">
        {earned.length === 0 ? (
          <span className="muted small-text">No badges yet</span>
        ) : (
          earned.map((b) => (
            <span key={b.id} className="mini-badge" title={`${b.name}: ${b.description}`}>
              <BadgeIcon id={b.id} size={16} />
            </span>
          ))
        )}
      </div>
    </article>
  );
}
