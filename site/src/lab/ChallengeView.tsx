import { useCallback, useState } from "react";
import { findRoadmapItem } from "../activity";
import type { LabData } from "../lab";
import { href } from "../route";
import { Avatar } from "../components/Avatar";
import { allPassed, type Challenge, type RunResult } from "./challenges";
import { CodeEditor } from "./CodeEditor";
import { Prose } from "./Prose";
import { runChallenge, type RunnerState } from "./pyRunner";

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

  const run = useCallback(async () => {
    if (state !== "idle") return;
    setResult(null);
    const r = await runChallenge(code, challenge.tests, setState);
    setResult(r);
    if (allPassed(r) && data.onSolved) data.onSolved(challenge.id);
  }, [state, code, challenge, data]);

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

  const passed = result ? result.results.filter((t) => t.ok).length : 0;

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
            <div className={`results${allPassed(result) ? " all-pass" : ""}`} role="status">
              {result.error ? (
                <p className="form-error">{result.error}</p>
              ) : (
                <p className="results-head">
                  <b>{passed}/{result.results.length} tests passed</b>
                  {allPassed(result) && <span> {iSolved || !me?.is_member ? "Nice work!" : `Solved! +${challenge.xp} XP`}</span>}
                </p>
              )}
              <ul className="test-list">
                {result.results.map((t, i) => {
                  const hidden = challenge.tests[i]?.hidden;
                  return (
                    <li key={t.name} className={t.ok ? "ok" : "fail"}>
                      <span className="test-mark" aria-hidden="true">{t.ok ? "✓" : "✗"}</span>
                      <span className="test-name">{hidden ? `Hidden test: ${t.name}` : t.name}</span>
                      {!t.ok && t.message && <span className="test-msg">{t.message}</span>}
                    </li>
                  );
                })}
              </ul>
              {result.stdout && (
                <details className="stdout">
                  <summary>Printed output</summary>
                  <pre>{result.stdout}</pre>
                </details>
              )}
            </div>
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
