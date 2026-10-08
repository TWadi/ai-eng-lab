import { useState } from "react";
import { buildFeed } from "../../logic/activity";
import type { LabData } from "../labData";
import { ActivityList, eventXp } from "../components/ActivityList";
import { Avatar } from "../components/Avatar";

function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((today - day) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

export function ActivityPage({ data }: { readonly data: LabData }) {
  const [who, setWho] = useState<string | null>(null);
  const all = buildFeed(data.progress, data.quizResults, 500, data.duels, data.duelEntries, data.solves);
  const events = who ? all.filter((e) => e.userId === who || (e.kind === "duel" && e.rivalId === who)) : all;
  const days = events.reduce<Array<{ label: string; items: typeof events[number][] }>>((acc, e) => {
    const label = dayLabel(e.at, data.now);
    const last = acc[acc.length - 1];
    return last && last.label === label
      ? [...acc.slice(0, -1), { label, items: [...last.items, e] }]
      : [...acc, { label, items: [e] }];
  }, []);

  return (
    <div className="page activity">
      <header className="page-head">
        <p className="eyebrow">Everything that happened</p>
        <h1>Activity</h1>
      </header>

      <div className="chips" role="group" aria-label="Filter by person">
        <button type="button" className={`chip${who === null ? " on" : ""}`} onClick={() => setWho(null)}>Everyone</button>
        {data.members.map((m) => (
          <button key={m.id} type="button" className={`chip${who === m.id ? " on" : ""}`} onClick={() => setWho(m.id)}>
            <Avatar member={m} size={20} color={data.colorOf(m.id)} /> {m.github_username}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        days.map((d) => (
          <section key={d.label} className="panel day">
            <div className="panel-head">
              <h2 className="panel-title">{d.label}</h2>
              <span className="xp-chip">+{d.items.reduce((s, e) => s + eventXp(e), 0)} XP</span>
            </div>
            <ActivityList events={d.items} data={data} />
          </section>
        ))
      )}
    </div>
  );
}
