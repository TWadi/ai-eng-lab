import { useEffect, useRef, useState } from "react";
import type { Profile } from "../supabase";
import type { RoadmapItem } from "../roadmap";
import type { Outcome } from "../hooks/useQuizzes";
import { DUEL_XP } from "../duels";
import { Avatar } from "./Avatar";

interface Props {
  readonly item: RoadmapItem;
  readonly rivals: readonly Profile[];
  readonly colorOf: (userId: string) => string;
  readonly create: (itemId: string, opponentId: string) => Promise<Outcome<string>>;
  readonly onCreated: (duelId: string) => void;
  readonly onClose: () => void;
}

export function ChallengeDialog({ item, rivals, colorOf, create, onCreated, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const pick = async (rival: Profile) => {
    setBusy(rival.id);
    setError(null);
    const res = await create(item.id, rival.id);
    setBusy(null);
    if (res.ok) onCreated(res.value);
    else setError(res.error);
  };

  return (
    <dialog ref={ref} className="quiz challenge" onClose={onClose} aria-labelledby="challenge-title">
      <header className="quiz-head duel-head">
        <div>
          <div className="ph-code">Duel</div>
          <h2 id="challenge-title">Who do you challenge?</h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>Close</button>
      </header>
      <div className="quiz-body">
        <p className="muted">
          You both get the same 5 questions on <b>{item.title}</b>. Higher score wins, and if it's a tie, the faster player wins.
          Winner gets +{DUEL_XP.win} XP, a draw gives +{DUEL_XP.draw} each. You play first, and your clock starts when the questions appear.
        </p>
        <div className="rivals">
          {rivals.map((r) => (
            <button key={r.id} type="button" className="rival" onClick={() => void pick(r)} disabled={busy !== null} style={{ ["--player" as string]: colorOf(r.id) }}>
              <Avatar member={r} size={48} color={colorOf(r.id)} />
              <span className="rival-name">{r.display_name || r.github_username}</span>
              <span className="rival-cta">{busy === r.id ? "Setting up…" : "Challenge"}</span>
            </button>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
