import { useCallback, useState } from "react";
import { findRoadmapItem } from "../../logic/activity";
import type { LabData } from "../labData";
import { href } from "../../logic/route";
import { Avatar } from "../components/Avatar";
import { allPassed, type Challenge, type RunResult, type RunnerState } from "../../logic/lab/challenges";
import { CodeEditor } from "./CodeEditor";
import { Prose } from "./Prose";
import { useRte } from "../../../rte/RteContext";
import { TestResults } from "./TestResults";

const DRAFT_KEY = (id: string) => `ai-eng-lab:draft:${id}`;

function loadDraft(c: Challenge): string {
  try {
    return localStorage.getItem(DRAFT_KEY(c.id)) ?? c.starter;
  } catch {
    return c.starter;
  }
}

function saveDraft(id: string, code: string): void {
  try {
    localStorage.setItem(DRAFT_KEY(id), code);
  } catch {
    // Storage blocked: the draft just isn't kept.
  }
}

export function ChallengeView({ challenge, data }: { readonly challenge: Challenge; readonly data: LabData }) {
  const [code, setCode] = useState(() => loadDraft(challenge));
  const [resetKey, setResetKey] = useState(0);
  const [state, setState] = useState<RunnerState>("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const me = data.me;
  const solvedBy = data.members.filter((m) => data.solves.some((s) => s.user_id === m.id && s.challenge_id === challenge.id));
  const iSolved = Boolean(me && solvedBy.some((m) => m.id === me.id));
  const item = findRoadmapItem(challenge.item);
  const { python } = useRte();

  const run = useCallback(async () => {
    if (state !== "idle") return;
    setResult(null);
    const r = await python.run(code, challenge.tests, setState);
    setResult(r);
    if (allPassed(r) && data.onSolved) data.onSolved(challenge.id);
  }, [state, code, challenge, data, python]);

  const onChange = (next: string) => {
    setCode(next);
    saveDraft(challenge.id, next);
  };

  const reset = () => {
    setCode(challenge.starter);
    saveDraft(challenge.id, challenge.starter);
    setResult(null);
    setResetKey((k) => k + 1);
  };

  return (
    <div className="challenge">
      <a className="back-link" href={href({ page: "lab" })}>← All challenges</a>
      <div className="challenge-grid">
        <section className="panel challenge-brief">
          <div className="quest-top">
            <span className={`level level-${challenge.level}`}>{challenge.level}</span>
            <span className="xp-chip">+{challenge.xp} XP</span>
            {iSolved && <span className="solved-pill">Solved</span>}
          </div>
          <h1 className="challenge-title">{challenge.title}</h1>
          {item && <p className="muted small-text">Practises <a href={href({ page: "roadmap", phase: challenge.item.split("-")[0] })}>{item.title}</a></p>}
          <Prose text={challenge.prompt} />
          <div className="solvers">
            <span className="muted small-text">{solvedBy.length ? "Solved by" : "Nobody has solved this yet."}</span>
            {solvedBy.map((m) => <Avatar key={m.id} member={m} size={26} color={data.colorOf(m.id)} />)}
          </div>
        </section>

        <section className="panel challenge-work">
          <CodeEditor value={code} onChange={onChange} onRun={() => void run()} resetKey={resetKey} />
          <div className="run-bar">
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={state !== "idle"}>
              {state === "loading" ? "Loading Python…" : state === "running" ? "Running…" : "Run tests"}
            </button>
            <span className="muted small-text">Ctrl + Enter</span>
            <button type="button" className="btn btn-ghost btn-small" onClick={reset} disabled={state !== "idle"}>Reset code</button>
          </div>
          {state === "loading" && (
            <p className="muted small-text">First run downloads Python for your browser (about 10 MB). After that it starts instantly.</p>
          )}

          {result && (
            <TestResults
              challenge={challenge}
              result={result}
              passNote={iSolved || !me?.is_member ? "Nice work!" : `Solved! +${challenge.xp} XP`}
            />
          )}

          <details className="visible-tests">
            <summary>See the visible tests</summary>
            {challenge.tests.filter((t) => !t.hidden).map((t) => (
              <div key={t.name}>
                <p className="small-text"><b>{t.name}</b></p>
                <pre>{t.code}</pre>
              </div>
            ))}
          </details>
        </section>
      </div>
    </div>
  );
}
