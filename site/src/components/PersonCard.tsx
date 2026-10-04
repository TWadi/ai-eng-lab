import type { Profile } from "../supabase";
import { PHASES, ALL_ITEM_IDS } from "../roadmap";
import { countDone, percent } from "../progress";

interface Props {
  readonly member: Profile;
  readonly done: Readonly<Record<string, string>> | undefined;
  readonly isMe: boolean;
}

export function PersonCard({ member, done, isMe }: Props) {
  const total = ALL_ITEM_IDS.length;
  const n = countDone(done, ALL_ITEM_IDS);
  const pct = percent(n, total);

  return (
    <article className="person">
      <div className="person-head">
        {member.avatar_url ? <img src={member.avatar_url} alt="" width={40} height={40} /> : <span className="avatar-fallback" />}
        <div>
          <div className="person-name">
            {member.display_name || member.github_username}
            {isMe && <span className="you">you</span>}
          </div>
          <a className="person-handle" href={`https://github.com/${member.github_username}`} target="_blank" rel="noopener">
            @{member.github_username}
          </a>
        </div>
        <div className="person-pct">{pct}%</div>
      </div>
      <div className="phase-strip" style={{ gridTemplateColumns: `repeat(${PHASES.length}, 1fr)` }} aria-label={`${n} of ${total} items done`}>
        {PHASES.map((p) => {
          const ids = p.items.map((i) => i.id);
          const d = countDone(done, ids);
          return (
            <div key={p.id} className="strip-seg" title={`${p.title}: ${d}/${ids.length}`}>
              <i style={{ width: `${percent(d, ids.length)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="person-foot">{n} of {total} items</div>
    </article>
  );
}
