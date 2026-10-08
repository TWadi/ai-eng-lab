import { buildFeed } from "../../logic/activity";
import { nextQuests } from "../../logic/gamify";
import type { LabData } from "../labData";
import { phaseForWeek, weekNumber, weekStart } from "../../logic/progress";
import { PHASES, START_DATE, TOTAL_WEEKS } from "../../logic/roadmap";
import { href } from "../../logic/route";
import { ActivityList } from "../components/ActivityList";
import { BadgeCabinet } from "../components/BadgeCabinet";
import { PlayerCard } from "../components/PlayerCard";
import { QuestRow } from "../components/QuestRow";
import { DuelsPanel } from "../components/DuelsPanel";
import { PlayersPanel } from "../components/PlayersPanel";
import { usePlayers } from "../../../rte/usePlayers";

function weekLine(now: Date): string {
  const week = weekNumber(START_DATE, now);
  if (week < 1) {
    const days = Math.ceil((weekStart(START_DATE, 1).getTime() - now.getTime()) / 86_400_000);
    return `Main track starts in ${days} ${days === 1 ? "day" : "days"}`;
  }
  return week > TOTAL_WEEKS ? "Track finished" : `Week ${week} of ${TOTAL_WEEKS}`;
}

export function DashboardPage({ data }: { readonly data: LabData }) {
  const { me, members, ranked, progress, now, loading } = data;
  const current = phaseForWeek(PHASES, weekNumber(START_DATE, now)) ?? PHASES[0];
  const quests = me?.is_member ? nextQuests(PHASES, current.id, progress[me.id] ?? {}) : [];
  const feed = buildFeed(progress, data.quizResults, 6, data.duels, data.duelEntries, data.solves);
  const admin = usePlayers(Boolean(me?.is_admin), data.onPlayersChanged);
  const waiting = admin.overview?.waiting.length ?? 0;

  return (
    <div className="page dashboard">
      {me?.is_admin && waiting > 0 && (
        <p className="banner waiting-alert" role="status">
          <b>{waiting === 1 ? "1 person is" : `${waiting} people are`} waiting to join.</b>{" "}
          <button type="button" className="btn btn-primary btn-small" onClick={() => document.getElementById("players-panel")?.scrollIntoView({ behavior: "smooth" })}>
            Review
          </button>
        </p>
      )}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{weekLine(now)}</p>
          <h1>Level up together.</h1>
          <p className="lede">
            Friends on a 40-week run from Python basics to shipping AI agents. Finish quests, ace quizzes, keep your streak alive.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary btn-big" href={href({ page: "roadmap", phase: current.id })}>Continue: {current.title}</a>
            <a className="btn btn-ghost btn-big" href={href({ page: "roadmap" })}>See the map</a>
          </div>
        </div>
        <div className="hero-sticker" aria-hidden="true">
          <span>NOW</span>
          <b>{current.short}</b>
        </div>
      </section>

      <section aria-labelledby="board-title">
        <div className="section-head">
          <h2 id="board-title" className="section-title">Leaderboard</h2>
          <span className="muted small-text">XP from quests, quizzes and finished phases</span>
        </div>
        {loading ? (
          <p className="muted">Loading players…</p>
        ) : members.length === 0 ? (
          <p className="empty">No players yet. Sign in with GitHub to join the board.</p>
        ) : (
          <div className="podium">
            {ranked.map((s, i) => {
              const member = data.memberById(s.userId);
              return member ? (
                <PlayerCard key={s.userId} member={member} stats={s} rank={i + 1} color={data.colorOf(s.userId)} isMe={s.userId === me?.id} delay={i * 90} />
              ) : null;
            })}
          </div>
        )}
      </section>

      <div className="dash-grid">
        <section className="panel" aria-labelledby="quests-title">
          <div className="panel-head">
            <h2 id="quests-title" className="panel-title">Your next quests</h2>
            <a href={href({ page: "roadmap", phase: current.id })} className="small-text">All quests</a>
          </div>
          {!me?.is_member ? (
            <p className="empty">Sign in as a lab member to see your next quests.</p>
          ) : quests.length === 0 ? (
            <p className="empty">Nothing left. You finished everything. Legend.</p>
          ) : (
            <ul className="quests">
              {quests.map(({ phase, item }) => (
                <QuestRow key={item.id} item={item} data={data} compact phaseLabel={phase.short} />
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="recent-title">
          <div className="panel-head">
            <h2 id="recent-title" className="panel-title">Latest moves</h2>
            <a href={href({ page: "activity" })} className="small-text">All activity</a>
          </div>
          {feed.length === 0 ? <p className="empty">Nothing yet. Tick a quest and it shows up here.</p> : <ActivityList events={feed} data={data} />}
        </section>
      </div>

      <DuelsPanel data={data} />

      <BadgeCabinet data={data} />

      {me?.is_admin && <PlayersPanel data={data} admin={admin} />}
    </div>
  );
}
