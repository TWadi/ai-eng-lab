import { useEffect, useRef } from "react";
import { countDone, percent, phaseForWeek, weekNumber, weekStart } from "../../logic/progress";
import { PHASES, START_DATE } from "../../logic/roadmap";
import { href } from "../../logic/route";
import { itemXp, XP } from "../../logic/gamify";
import type { LabData } from "../labData";
import { Avatar } from "../components/Avatar";
import { QuestRow } from "../components/QuestRow";

const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function RoadmapPage({ data, phaseId }: { readonly data: LabData; readonly phaseId?: string }) {
  const { me, members, progress, now } = data;
  const current = phaseForWeek(PHASES, weekNumber(START_DATE, now)) ?? PHASES[0];
  const phase = PHASES.find((p) => p.id === phaseId) ?? current;
  const ids = phase.items.map((i) => i.id);
  const [from, to] = phase.weeks;
  const when = from < 1 ? "Before week 1" : from === to ? `Week ${from}` : `Weeks ${from}–${to}`;
  const phaseXp = phase.items.reduce((s, i) => s + itemXp(i), 0) + XP.phaseComplete;
  const myDone = me ? progress[me.id] ?? {} : {};
  const worldRef = useRef<HTMLOListElement>(null);

  // Keep the selected phase visible on the scrollable map.
  useEffect(() => {
    worldRef.current?.querySelector(".world-node.selected")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [phase.id]);

  return (
    <div className="page roadmap">
      <nav className="world" aria-label="Phases">
        <ol className="world-path" ref={worldRef}>
          {PHASES.map((p, i) => {
            const pIds = p.items.map((it) => it.id);
            const pct = me ? percent(countDone(myDone, pIds), pIds.length) : 0;
            const cleared = pct === 100;
            return (
              <li key={p.id} className="world-stop" style={{ animationDelay: `${i * 40}ms` }}>
                <a
                  href={href({ page: "roadmap", phase: p.id })}
                  className={`world-node${p.id === phase.id ? " selected" : ""}${p.id === current.id ? " current" : ""}${cleared ? " cleared" : ""}`}
                  style={{ ["--pct" as string]: `${pct}%` }}
                  aria-current={p.id === phase.id ? "page" : undefined}
                  title={`${p.title}${me ? ` · ${pct}% done` : ""}`}
                >
                  <span className="world-label">{p.short}</span>
                </a>
                <span className="world-name">{p.title.split(":")[0]}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="phase-card" aria-labelledby="phase-title">
        <header className="phase-head">
          <div>
            <p className="eyebrow">
              {phase.code} · {when} · {fmt(weekStart(START_DATE, Math.max(from, 0)))} → {fmt(weekStart(START_DATE, to + 1))}
              {phase.id === current.id && <span className="now-pill">now</span>}
            </p>
            <h1 id="phase-title">{phase.title}</h1>
            <p className="lede">{phase.goal}</p>
          </div>
          <div className="phase-reward" aria-label={`Up to ${phaseXp} XP in this phase`}>
            <span>Reward</span>
            <b>{phaseXp}</b>
            <span>XP</span>
          </div>
        </header>

        <div className="crew">
          {members.map((m) => {
            const d = countDone(progress[m.id], ids);
            const pct = percent(d, ids.length);
            return (
              <div key={m.id} className="crew-row" style={{ ["--player" as string]: data.colorOf(m.id) }}>
                <Avatar member={m} size={26} color={data.colorOf(m.id)} />
                <span className="crew-name">{m.github_username}</span>
                <span className="crew-bar"><i style={{ width: `${pct}%` }} /></span>
                <span className="crew-num">{d}/{ids.length}</span>
              </div>
            );
          })}
        </div>

        <ul className="quests">
          {phase.items.map((item) => <QuestRow key={item.id} item={item} data={data} />)}
        </ul>

        <div className="boss">
          <span className="boss-tag">Boss level</span>
          <p>{phase.ship}</p>
          <span className="xp-chip">+{XP.phaseComplete} XP when the phase is cleared</span>
        </div>
      </section>
    </div>
  );
}
