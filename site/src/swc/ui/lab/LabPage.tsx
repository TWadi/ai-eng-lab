import { findRoadmapItem } from "../../logic/activity";
import type { LabData } from "../labData";
import { href } from "../../logic/route";
import { Avatar } from "../components/Avatar";
import { CHALLENGES, findChallenge } from "../../logic/lab/challenges";
import { ChallengeView } from "./ChallengeView";
import { Playground } from "./Playground";
import { RacePanel } from "./RacePanel";
import { Scratchpad } from "./Scratchpad";
import { TokenizerLab } from "./TokenizerLab";

/** Lab sub-pages besides challenges (their ids can't be challenge ids). */
const TABS = [
  { id: "", label: "Coding challenges" },
  { id: "scratchpad", label: "Python scratchpad" },
  { id: "playground", label: "Embeddings & RAG" },
  { id: "tokenizer", label: "Tokenizers" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabOf(sub: string | undefined): TabId | null {
  const found = TABS.find((t) => t.id === (sub ?? ""));
  return found ? found.id : null;
}

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
  const tab = tabOf(sub);
  const challenge = tab === null && sub ? findChallenge(sub) : undefined;

  return (
    <div className="page lab">
      {!challenge && (
        <header className="page-head lab-head">
          <p className="eyebrow">Hands-on</p>
          <h1>The Lab</h1>
          <p className="lede">
            Solve graded Python challenges, race a friend, experiment in a notebook, and poke at real embedding models, tokenizers and a local LLM. All in your browser, nothing to install, nothing to pay.
          </p>
          <nav className="lab-tabs" aria-label="Lab sections">
            {TABS.map((t) => (
              <a key={t.id} href={href({ page: "lab", lab: t.id || undefined })} aria-current={tab === t.id ? "page" : undefined}>{t.label}</a>
            ))}
          </nav>
        </header>
      )}

      {challenge ? (
        <ChallengeView key={challenge.id} challenge={challenge} data={data} />
      ) : tab === "playground" ? (
        <Playground />
      ) : tab === "tokenizer" ? (
        <TokenizerLab />
      ) : tab === "scratchpad" ? (
        <Scratchpad />
      ) : tab === null ? (
        <p className="empty">No challenge called "{sub}". <a href={href({ page: "lab" })}>See all challenges</a></p>
      ) : (
        <>
          <RacePanel data={data} />
          <ChallengeList data={data} />
        </>
      )}
    </div>
  );
}
