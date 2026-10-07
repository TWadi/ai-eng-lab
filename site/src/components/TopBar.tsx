import type { AuthState } from "../hooks/useAuth";
import type { PlayerStats } from "../gamify";
import { href, type Page } from "../route";
import { Avatar } from "./Avatar";

interface Props {
  readonly page: Page;
  readonly auth: AuthState;
  readonly enabled: boolean;
  readonly myStats: PlayerStats | undefined;
  readonly myColor: string;
  readonly invites: number;
  readonly onBell: () => void;
}

const NAV: ReadonlyArray<{ page: Page; label: string }> = [
  { page: "dashboard", label: "Dashboard" },
  { page: "roadmap", label: "Roadmap" },
  { page: "lab", label: "Lab" },
  { page: "activity", label: "Activity" },
];

export function TopBar({ page, auth, enabled, myStats, myColor, invites, onBell }: Props) {
  const { session, profile, loading, signIn, signOut } = auth;

  return (
    <header className="topbar">
      <a className="logo" href={href({ page: "dashboard" })} aria-label="AI Engineering Arena home">
        <span className="logo-mark" aria-hidden="true">AI</span>
        <span className="logo-text">Eng Arena</span>
      </a>

      <nav className="nav" aria-label="Pages">
        {NAV.map((n) => (
          <a key={n.page} href={href({ page: n.page })} className="nav-link" aria-current={page === n.page ? "page" : undefined}>
            {n.label}
          </a>
        ))}
      </nav>

      <div className="topbar-auth">
        {!enabled ? null : loading ? (
          <span className="muted small-text">…</span>
        ) : session ? (
          <>
            {profile?.is_member && (
              <button
                type="button"
                className={`bell${invites > 0 ? " ringing" : ""}`}
                onClick={onBell}
                aria-label={invites > 0 ? `${invites} duel challenge${invites > 1 ? "s" : ""} waiting` : "No duel challenges"}
                title={invites > 0 ? "Duel challenge waiting" : "No challenges right now"}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
                  <path d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {invites > 0 && <span className="bell-count">{invites}</span>}
              </button>
            )}
            {profile && myStats && (
              <a className="me-chip" href={href({ page: "player", player: profile.github_username })} title={`Your profile · ${myStats.level.title} · ${myStats.xp} XP`}>
                <Avatar member={profile} size={30} color={myColor} />
                <span className="me-level">Lv {myStats.level.level}</span>
              </a>
            )}
            <button type="button" className="btn btn-ghost" onClick={signOut}>Sign out</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={signIn}>Sign in with GitHub</button>
        )}
      </div>
    </header>
  );
}
