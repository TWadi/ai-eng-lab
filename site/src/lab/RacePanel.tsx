import { useState } from "react";
import { DUEL_XP } from "../duels";
import type { LabData } from "../lab";
import { Avatar } from "../components/Avatar";

/** Challenge a friend to a code race: a random challenge, revealed to both at the same moment. */
export function RacePanel({ data }: { readonly data: LabData }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);
  const { me, onRace } = data;
  if (!me?.is_member || !onRace) return null;
  const rivals = data.members.filter((m) => m.id !== me.id);
  if (rivals.length === 0) return null;
  const wins = data.duels.filter((d) => d.kind === "code" && d.status === "done" && d.winner === me.id).length;

  const race = async (opponentId: string) => {
    setBusy(opponentId);
    setMessage(null);
    const res = await onRace(opponentId);
    setBusy(null);
    setMessage(res.ok ? { ok: true, text: "Challenge sent! The race starts as soon as they accept." } : { ok: false, text: res.error });
  };

  return (
    <section className="panel race-panel" aria-labelledby="race-title">
      <div className="race-panel-text">
        <p className="eyebrow">Code race</p>
        <h2 id="race-title" className="panel-title">Race a friend</h2>
        <p className="muted">
          Same random challenge, same moment, 15 minutes. First to pass every test wins +{DUEL_XP.win} XP, and afterwards you can read each other's code.
          {wins > 0 && <> You've won <b>{wins}</b> race{wins === 1 ? "" : "s"}.</>}
        </p>
        {message && <p className={message.ok ? "form-ok" : "form-error"} role="status">{message.text}</p>}
      </div>
      <div className="rivals">
        {rivals.map((r) => (
          <button key={r.id} type="button" className="rival" onClick={() => void race(r.id)} disabled={busy !== null} style={{ ["--player" as string]: data.colorOf(r.id) }}>
            <Avatar member={r} size={44} color={data.colorOf(r.id)} />
            <span className="rival-name">{r.display_name || r.github_username}</span>
            <span className="rival-cta">{busy === r.id ? "Sending…" : "Race"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
