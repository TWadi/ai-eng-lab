import type { ReactNode } from "react";
import { allPassed, type Challenge, type RunResult } from "../../logic/lab/challenges";

interface Props {
  readonly challenge: Challenge;
  readonly result: RunResult;
  /** Shown after "n/n tests passed" when everything passed. */
  readonly passNote?: ReactNode;
}

export function TestResults({ challenge, result, passNote }: Props) {
  const passed = result.results.filter((t) => t.ok).length;
  return (
    <div className={`results${allPassed(result) ? " all-pass" : ""}`} role="status">
      {result.error ? (
        <p className="form-error">{result.error}</p>
      ) : (
        <p className="results-head">
          <b>{passed}/{result.results.length} tests passed</b>
          {allPassed(result) && passNote && <span> {passNote}</span>}
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
  );
}
