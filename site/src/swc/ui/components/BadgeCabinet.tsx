import { BADGES } from "../../logic/gamify";
import type { LabData } from "../labData";
import { Avatar } from "./Avatar";
import { BadgeIcon } from "./BadgeIcon";

export function BadgeCabinet({ data }: { readonly data: LabData }) {
  return (
    <section className="panel" aria-labelledby="badges-title">
      <div className="panel-head">
        <h2 id="badges-title" className="panel-title">Badge cabinet</h2>
        <span className="muted small-text">{BADGES.length} to collect</span>
      </div>
      <ul className="badges">
        {BADGES.map((b, i) => {
          const holders = data.ranked.filter((s) => s.badges.has(b.id));
          return (
            <li key={b.id} className={`badge${holders.length ? " unlocked" : ""}`} style={{ ["--tilt" as string]: `${(i % 3) - 1}deg` }}>
              <span className="badge-icon"><BadgeIcon id={b.id} size={26} /></span>
              <span className="badge-name">{b.name}</span>
              <span className="badge-desc">{b.description}</span>
              <span className="badge-holders">
                {holders.map((h) => (
                  <Avatar key={h.userId} member={data.memberById(h.userId)} size={20} color={data.colorOf(h.userId)} />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
