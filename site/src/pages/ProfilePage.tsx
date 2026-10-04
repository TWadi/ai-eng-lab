import { useState } from "react";
import { findRoadmapItem, relativeTime } from "../activity";
import { duelRecord, formatTime, viewDuel } from "../duels";
import { BADGES, xpTimeline } from "../gamify";
import type { LabData } from "../lab";
import { countDone, percent } from "../progress";
import { PHASES } from "../roadmap";
import { href } from "../route";
import { Avatar } from "../components/Avatar";
import { BadgeIcon } from "../components/BadgeIcon";
import { PlayerLink } from "../components/ActivityList";
import { XpChart } from "../components/XpChart";
import { ShareDialog } from "../components/ShareDialog";

const REPO = "https://github.com/TWadi/ai-eng-lab/tree/main";
const PHASE_FOLDERS: Record<string, string> = {
  rag: "rag-course", p0: "00-setup", p1: "01-foundations", p2: "02-classical-ml", p3: "03-deep-learning",
  p4: "04-llm-apps", p5: "05-agents-mcp", p6: "06-production", p7: "07-capstone",
};

export function ProfilePage({ data, username }: { readonly data: LabData; readonly username: string }) {
  const [sharing, setSharing] = useState(false);
  const member = data.members.find((m) => m.github_username.toLowerCase() === username.toLowerCase());
  if (!member) {
    return (
      <div className="page">
        <section className="panel">
          <h1 className="panel-title">Player not found</h1>
          <p className="empty">{data.loading ? "Loading players…" : `No lab member called "${username}".`} <a href={href({ page: "dashboard" })}>Back to the dashboard</a></p>
        </section>
      </div>
    );
  }

  const stats = data.stats.get(member.id);
  const rank = data.ranked.findIndex((s) => s.userId === member.id) + 1;
  const color = data.colorOf(member.id);
  const done = data.progress[member.id] ?? {};
  const quizzes = data.quizResults.filter((q) => q.user_id === member.id);
  const accuracy = quizzes.length ? Math.round((quizzes.reduce((s, q) => s + q.score / q.total, 0) / quizzes.length) * 100) : null;
  const record = duelRecord(member.id, data.duels);
  const timeline = xpTimeline(member.id, data.progress, data.quizResults, data.duels);
  const duels = data.duels
    .filter((d) => d.status === "done" && (d.challenger === member.id || d.opponent === member.id))
    .slice(0, 6)
    .map((d) => viewDuel(d, data.duelEntries, member.id, data.now));
  const isMe = data.me?.id === member.id;

  return (
    <div className="page profile" style={{ ["--player" as string]: color }}>
      <section className="profile-hero">
        <Avatar member={member} size={112} color={color} />
        <div className="profile-id">
          <p className="eyebrow">
            {rank > 0 && <span className="rank-pill">Rank #{rank}</span>}
            {isMe && <span className="tag-you">you</span>}
          </p>
          <h1>{member.display_name || member.github_username}</h1>
          <p className="profile-handle">
            <a href={`https://github.com/${member.github_username}`} target="_blank" rel="noopener">@{member.github_username} on GitHub ↗</a>
          </p>
          {stats && (
            <div className="xp profile-xp">
              <div className="xp-row">
                <span className="xp-total">Lv {stats.level.level} · {stats.level.title}</span>
                <span className="xp-next">{stats.xp} XP · {stats.level.nextXp - stats.xp} to Lv {stats.level.level + 1}</span>
              </div>
              <div className="xp-bar"><i style={{ width: `${Math.round(stats.level.progress * 100)}%` }} /></div>
            </div>
          )}
          {stats && (
            <button type="button" className="btn btn-primary share-btn" onClick={() => setSharing(true)}>
              {isMe ? "Share my card" : `Make ${member.display_name || member.github_username}'s card`}
            </button>
          )}
        </div>
      </section>

      <dl className="stat-grid">
        <div><dt>Total XP</dt><dd>{stats?.xp ?? 0}</dd></div>
        <div><dt>Quests done</dt><dd>{stats?.itemsDone ?? 0}</dd></div>
        <div><dt>Streak</dt><dd>{stats?.streak ?? 0} wk</dd></div>
        <div><dt>Quiz accuracy</dt><dd>{accuracy === null ? "—" : `${accuracy}%`}</dd></div>
        <div><dt>Perfect quizzes</dt><dd>{stats?.perfectQuizzes ?? 0}</dd></div>
        <div><dt>Duels W-L-D</dt><dd>{record.wins}-{record.losses}-{record.draws}</dd></div>
      </dl>

      <section className="panel" aria-labelledby="chart-title">
        <div className="panel-head">
          <h2 id="chart-title" className="panel-title">XP over time</h2>
          {stats && <span className="xp-chip">+{stats.weekXp} XP this week</span>}
        </div>
        <XpChart points={timeline} color={color} />
      </section>

      <div className="dash-grid">
        <section className="panel" aria-labelledby="journey-title">
          <div className="panel-head"><h2 id="journey-title" className="panel-title">Journey</h2></div>
          <ul className="journey">
            {PHASES.map((p) => {
              const ids = p.items.map((i) => i.id);
              const d = countDone(done, ids);
              const pct = percent(d, ids.length);
              return (
                <li key={p.id} className={pct === 100 ? "cleared" : ""}>
                  <a className="journey-code" href={href({ page: "roadmap", phase: p.id })}>{p.short}</a>
                  <div className="journey-main">
                    <div className="journey-top">
                      <a href={href({ page: "roadmap", phase: p.id })}>{p.title}</a>
                      <span className="crew-num">{d}/{ids.length}</span>
                    </div>
                    <span className="crew-bar"><i style={{ width: `${pct}%` }} /></span>
                  </div>
                  <a className="journey-repo" href={`${REPO}/${PHASE_FOLDERS[p.id]}/${member.github_username}`} target="_blank" rel="noopener" title="Their code for this phase on GitHub">code ↗</a>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="quiz-history-title">
            <div className="panel-head"><h2 id="quiz-history-title" className="panel-title">Recent quizzes</h2></div>
            {quizzes.length === 0 ? <p className="empty">No quizzes yet.</p> : (
              <ul className="history">
                {quizzes.slice(0, 8).map((q) => (
                  <li key={q.id}>
                    <span className={`score${q.score === q.total ? " perfect" : ""}`}>{q.score}/{q.total}</span>
                    <span className="history-title">{findRoadmapItem(q.item_id)?.title ?? q.item_id}</span>
                    <time dateTime={q.completed_at}>{relativeTime(q.completed_at, data.now)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="duel-history-title">
            <div className="panel-head"><h2 id="duel-history-title" className="panel-title">Duel record</h2></div>
            {duels.length === 0 ? <p className="empty">No finished duels yet.</p> : (
              <ul className="history">
                {duels.map((v) => (
                  <li key={v.duel.id}>
                    <span className={`duel-state state-${v.state}`}>{v.state === "won" ? "W" : v.state === "lost" ? "L" : "D"}</span>
                    <span className="history-title">
                      vs <PlayerLink member={data.memberById(v.rivalId)} /> · {v.mine?.score ?? "?"}–{v.theirs?.score ?? "?"} · {formatTime(v.mine?.time_ms)}
                    </span>
                    <time dateTime={v.duel.completed_at ?? ""}>{relativeTime(v.duel.completed_at ?? v.duel.created_at, data.now)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {sharing && stats && (
        <ShareDialog
          input={{ name: member.display_name || member.github_username, handle: member.github_username, stats, record }}
          avatarUrl={member.avatar_url}
          color={color}
          onClose={() => setSharing(false)}
        />
      )}

      <section className="panel" aria-labelledby="profile-badges-title">
        <div className="panel-head">
          <h2 id="profile-badges-title" className="panel-title">Badges</h2>
          <span className="muted small-text">{stats?.badges.size ?? 0} of {BADGES.length}</span>
        </div>
        <ul className="badges">
          {BADGES.map((b, i) => (
            <li key={b.id} className={`badge${stats?.badges.has(b.id) ? " unlocked" : ""}`} style={{ ["--tilt" as string]: `${(i % 3) - 1}deg` }}>
              <span className="badge-icon"><BadgeIcon id={b.id} size={26} /></span>
              <span className="badge-name">{b.name}</span>
              <span className="badge-desc">{b.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
