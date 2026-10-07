import { bestScores, hasPassed } from "../activity";
import { itemXp } from "../gamify";
import type { LabData } from "../lab";
import type { RoadmapItem } from "../roadmap";
import { Avatar } from "./Avatar";

interface Props {
  readonly item: RoadmapItem;
  readonly data: LabData;
  readonly compact?: boolean;
  readonly phaseLabel?: string;
}

export function QuestRow({ item, data, compact = false, phaseLabel }: Props) {
  const { me, progress, members, onToggle, onQuiz, onDuel } = data;
  const mine = me ? progress[me.id] ?? {} : {};
  const done = item.id in mine;
  const finishers = members.filter((m) => item.id in (progress[m.id] ?? {}));
  const best = bestScores(data.quizResults, item.id);
  const scored = members.filter((m) => best[m.id]);
  const hasQuiz = data.quizAvailable.has(item.id);
  const inputId = `q-${compact ? "c-" : ""}${item.id}`;
  // A lecture with a quiz is completed by passing the quiz (4/5), not by ticking the box.
  const locked = hasQuiz && !done && !(me && hasPassed(data.quizResults, me.id, item.id));

  return (
    <li className={`quest${done ? " done" : ""}${compact ? " compact" : ""}`}>
      {onToggle ? (
        <input
          type="checkbox"
          id={inputId}
          className="quest-check"
          checked={done}
          disabled={locked || done}
          title={done ? "Done! Finished lessons stay finished." : locked ? "Pass the quiz (4/5 or better) to complete this" : undefined}
          onChange={(e) => { if (e.target.checked) onToggle(item.id, true, e.currentTarget); }}
          aria-label={done ? `"${item.title}" is done` : locked ? `Pass the quiz to complete "${item.title}"` : `Mark "${item.title}" as done`}
        />
      ) : (
        <span className="quest-check placeholder" aria-hidden="true" />
      )}

      <div className="quest-main">
        <div className="quest-top">
          <span className={`kind kind-${item.kind}`}>{item.kind}</span>
          {phaseLabel && <span className="quest-phase">{phaseLabel}</span>}
          <span className="xp-chip">+{itemXp(item)} XP</span>
        </div>
        <label className="quest-title" htmlFor={onToggle ? inputId : undefined}>{item.title}</label>
        {!compact && (item.url || item.source) && (
          <div className="quest-src">
            {item.url ? <a href={item.url} target="_blank" rel="noopener">{item.source ?? "Open"} ↗</a> : item.source}
          </div>
        )}
        {!compact && hasQuiz && (onQuiz || scored.length > 0) && (
          <div className="quest-quiz">
            {onQuiz && <button type="button" className="btn btn-quiz" onClick={() => onQuiz(item)}>Quiz me</button>}
            {onQuiz && locked && <span className="quiz-gate">Pass with 4/5 to complete</span>}
            {onDuel && members.length > 1 && <button type="button" className="btn btn-duel" onClick={() => onDuel(item)}>Duel</button>}
            {scored.map((m) => {
              const s = best[m.id];
              return (
                <span key={m.id} className={`score${s.score === s.total ? " perfect" : ""}`} title={`Best score of ${m.github_username}`}>
                  <Avatar member={m} size={16} color={data.colorOf(m.id)} /> {s.score}/{s.total}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="quest-who" aria-label={`${finishers.length} finished`}>
        {finishers.map((m) => (
          <Avatar key={m.id} member={m} size={24} color={data.colorOf(m.id)} />
        ))}
      </div>
    </li>
  );
}
