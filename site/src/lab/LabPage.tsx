import { findRoadmapItem } from "../activity";
import type { LabData } from "../lab";
import { href } from "../route";
import { Avatar } from "../components/Avatar";
import { CHALLENGES, findChallenge } from "./challenges";
import { ChallengeView } from "./ChallengeView";
import { Playground } from "./Playground";

function ChallengeList({ data }: { readonly data: LabData }) {
  const mine = new Set(data.me ? data.solves.filter((s) => s.user_id === data.me!.id).map((s) => s.challenge_id) : []);
  return (
    <ul className="challenge-list">
      {CHALLENGES.map((c, i) => {
        const solvers = data.members.filter((m) => data.solves.some((s) => s.user_id === m.id && s.challenge_id === c.id));
        return (
          <li key={c.id} style={{ animationDelay: `${i * 40}ms` }}>
            <a className={`challenge-card${mine.has(c.id) ? " solved" : ""}`} href={href({ page: "lab", lab: c.id })}>
              <div className="quest-top">
                <span className={`level level-${c.level}`}>{c.level}</span>
                <span className="xp-chip">+{c.xp} XP</span>
                {mine.has(c.id) && <span className="solved-pill">Solved</span>}
              </div>
              <span className="challenge-card-title">{c.title}</span>
              <span className="muted small-text">{findRoadmapItem(c.item)?.title}</span>
              <span className="challenge-solvers">
                {solvers.map((m) => <Avatar key={m.id} member={m} size={22} color={data.colorOf(m.id)} />)}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default function LabPage({ data, sub }: { readonly data: LabData; readonly sub?: string }) {
  const challenge = sub && sub !== "playground" ? findChallenge(sub) : undefined;
  const tab = sub === "playground" ? "playground" : "challenges";

  return (
    <div className="page lab">
      {!challenge && (
        <header className="page-head lab-head">
          <p className="eyebrow">Hands-on</p>
          <h1>The Lab</h1>
          <p className="lede">
            Write real Python in your browser and see it graded instantly, or play with a real embedding model. Nothing to install, nothing to pay.
          </p>
          <nav className="lab-tabs" aria-label="Lab sections">
            <a href={href({ page: "lab" })} aria-current={tab === "challenges" ? "page" : undefined}>Coding challenges</a>
            <a href={href({ page: "lab", lab: "playground" })} aria-current={tab === "playground" ? "page" : undefined}>Embeddings playground</a>
          </nav>
        </header>
      )}

      {challenge ? (
        <ChallengeView key={challenge.id} challenge={challenge} data={data} />
      ) : tab === "playground" ? (
        <Playground />
      ) : sub ? (
        <p className="empty">No challenge called "{sub}". <a href={href({ page: "lab" })}>See all challenges</a></p>
      ) : (
        <ChallengeList data={data} />
      )}
    </div>
  );
}
