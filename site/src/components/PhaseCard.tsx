import type { Profile } from "../supabase";
import type { Phase } from "../roadmap";
import type { ProgressByUser } from "../progress";
import { START_DATE } from "../roadmap";
import { weekStart } from "../progress";

interface Props {
  readonly phase: Phase;
  readonly isCurrent: boolean;
  readonly members: readonly Profile[];
  readonly progress: ProgressByUser;
  readonly me: Profile | null;
  readonly onToggle: (itemId: string, done: boolean) => void;
}

const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function PhaseCard({ phase, isCurrent, members, progress, me, onToggle }: Props) {
  const [from, to] = phase.weeks;
  const range = from < 1 ? "before week 1" : from === to ? `wk ${from}` : `wk ${from}–${to}`;
  const canEdit = Boolean(me?.is_member);
  const mine = me ? progress[me.id] ?? {} : {};

  return (
    <section className={`phase${isCurrent ? " current" : ""}`} id={phase.id}>
      <div className="ph-head">
        <div>
          <div className="ph-code">{phase.code}</div>
          <h2>
            {phase.title}
            {isCurrent && <span className="now-pill">now</span>}
          </h2>
        </div>
        <div className="ph-meta">
          {range}
          <br />
          {fmt(weekStart(START_DATE, from))} → {fmt(weekStart(START_DATE, to + 1))}
        </div>
      </div>
      <p className="goal">{phase.goal}</p>

      <ul className="items">
        {phase.items.map((item) => {
          const doneByMe = item.id in mine;
          const finishers = members.filter((m) => item.id in (progress[m.id] ?? {}));
          const inputId = `cb-${item.id}`;
          return (
            <li key={item.id} className={doneByMe ? "is-done" : ""}>
              {canEdit ? (
                <input
                  type="checkbox"
                  id={inputId}
                  checked={doneByMe}
                  onChange={(e) => onToggle(item.id, e.target.checked)}
                />
              ) : (
                <span className="dot" aria-hidden="true" />
              )}
              <label className="it-text" htmlFor={canEdit ? inputId : undefined}>
                <span className={`kind ${item.kind}`}>{item.kind}</span>
                <span className="it-title">{item.title}</span>
                {(item.url || item.source) && (
                  <span className="it-src">
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noopener">{item.source ?? "link"}</a>
                    ) : (
                      item.source
                    )}
                  </span>
                )}
              </label>
              <div className="who">
                {finishers.map((m) =>
                  m.avatar_url ? (
                    <img key={m.id} src={m.avatar_url} alt={m.github_username} title={`${m.github_username} finished this`} width={22} height={22} />
                  ) : null,
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="ship">
        <b>Ship</b>
        {phase.ship}
      </div>
    </section>
  );
}
