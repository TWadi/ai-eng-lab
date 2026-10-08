import { useState, type FormEvent } from "react";
import { relativeTime } from "../../logic/activity";
import type { LabData } from "../labData";
import { cleanGithubInput, isGithubUsername, type PlayersAdmin } from "../../../rte/usePlayers";
import { Avatar } from "./Avatar";

type Note = { readonly ok: boolean; readonly text: string } | null;

/** Admin-only: let people who signed in become players, invite usernames ahead of time, remove players. */
export function PlayersPanel({ data, admin }: { readonly data: LabData; readonly admin: PlayersAdmin }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  if (!data.me?.is_admin) return null;

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(key);
    setNote(null);
    const res = await fn();
    setBusy(null);
    setConfirm(null);
    setNote(res.ok ? { ok: true, text: success } : { ok: false, text: res.error ?? "Something went wrong." });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const github = cleanGithubInput(name);
    if (!isGithubUsername(github)) {
      setNote({ ok: false, text: "That doesn't look like a GitHub username." });
      return;
    }
    void run("invite", async () => {
      const res = await admin.invite(github);
      if (res.ok) setName("");
      return res;
    }, `@${github} is in. If they haven't signed in yet, they become a player the moment they do.`);
  };

  const players = data.members.filter((m) => !m.is_admin);
  const waiting = admin.overview?.waiting ?? [];
  const invited = admin.overview?.invited ?? [];
  const declined = admin.overview?.declined ?? [];

  return (
    <section className="panel players-panel" id="players-panel" aria-labelledby="players-title">
      <div className="panel-head">
        <h2 id="players-title" className="panel-title">Players</h2>
        <span className="admin-tag">Admins only</span>
      </div>
      <p className="muted small-text">
        Players can tick quests, take quizzes, duel and race, and they show up on the leaderboard.
        This has nothing to do with the GitHub repo: nobody gets repo access from being a player.
      </p>

      <form className="invite-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="invite-name">GitHub username</label>
        <input id="invite-name" className="lab-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="GitHub username, e.g. omar-dev" autoComplete="off" spellCheck={false} />
        <button type="submit" className="btn btn-primary" disabled={busy !== null || !name.trim()}>{busy === "invite" ? "Inviting…" : "Invite"}</button>
      </form>
      {note && <p className={note.ok ? "players-ok" : "form-error"} role="status">{note.text}</p>}
      {admin.error && <p className="form-error">{admin.error}</p>}

      <h3 className="players-sub">Waiting to join {waiting.length > 0 && <span className="duel-badge">{waiting.length}</span>}</h3>
      {waiting.length === 0 ? (
        <p className="empty">Nobody's waiting. When someone signs in with GitHub, they show up here.</p>
      ) : (
        <ul className="player-rows">
          {waiting.map((w) => (
            <li key={w.github_username}>
              <Avatar member={{ id: w.github_username, github_username: w.github_username, display_name: w.display_name, avatar_url: w.avatar_url, is_member: false }} size={34} color="var(--edge)" />
              <span className="player-row-name">
                <b>{w.display_name || w.github_username}</b>
                <span className="muted small-text">@{w.github_username} · signed in {relativeTime(w.signed_in_at, data.now)}</span>
              </span>
              <button type="button" className="btn btn-primary btn-small" disabled={busy !== null}
                onClick={() => void run(w.github_username, () => admin.invite(w.github_username), `${w.display_name || w.github_username} is now a player.`)}>
                {busy === w.github_username ? "Letting in…" : "Let in"}
              </button>
              <button type="button" className="btn btn-ghost btn-small" disabled={busy !== null}
                onClick={() => void run(`no-${w.github_username}`, () => admin.decline(w.github_username), `Declined @${w.github_username}. You can still let them in later.`)}>
                {busy === `no-${w.github_username}` ? "Declining…" : "Decline"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {declined.length > 0 && (
        <details className="declined-list">
          <summary>Declined ({declined.length})</summary>
          <ul className="invited-chips">
            {declined.map((d) => (
              <li key={d.github_username}>
                @{d.github_username}
                <button type="button" className="btn-link" disabled={busy !== null}
                  onClick={() => void run(d.github_username, () => admin.invite(d.github_username), `${d.display_name || d.github_username} is now a player.`)}>Let in</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {invited.length > 0 && (
        <>
          <h3 className="players-sub">Invited, not signed in yet</h3>
          <ul className="invited-chips">
            {invited.map((g) => (
              <li key={g}>
                @{g}
                <button type="button" className="chip-x" aria-label={`Cancel the invite for ${g}`} disabled={busy !== null}
                  onClick={() => void run(g, () => admin.remove(g), `Invite for @${g} cancelled.`)}>×</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="players-sub">Players</h3>
      {players.length === 0 ? <p className="empty">Only admins so far.</p> : (
        <ul className="player-rows">
          {players.map((m) => (
            <li key={m.id}>
              <Avatar member={m} size={34} color={data.colorOf(m.id)} />
              <span className="player-row-name">
                <b>{m.display_name || m.github_username}</b>
                <span className="muted small-text">@{m.github_username}</span>
              </span>
              {confirm === m.github_username ? (
                <span className="remove-confirm">
                  Remove?{" "}
                  <button type="button" className="btn btn-ghost btn-small" disabled={busy !== null}
                    onClick={() => void run(m.github_username, () => admin.remove(m.github_username), `@${m.github_username} is no longer a player. Their history is kept but hidden.`)}>Yes</button>
                  <button type="button" className="btn-link" onClick={() => setConfirm(null)}>No</button>
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirm(m.github_username)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
