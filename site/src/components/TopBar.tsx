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
}

const NAV: ReadonlyArray<{ page: Page; label: string }> = [
  { page: "dashboard", label: "Dashboard" },
  { page: "roadmap", label: "Roadmap" },
  { page: "activity", label: "Activity" },
];

export function TopBar({ page, auth, enabled, myStats, myColor }: Props) {
  const { session, profile, loading, signIn, signOut } = auth;

  return (
    <header className="topbar">
      <a className="logo" href={href({ page: "dashboard" })} aria-label="AI Engineering Lab home">
        <span className="logo-mark" aria-hidden="true">AI</span>
        <span className="logo-text">Eng Lab</span>
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
            {profile && myStats && (
              <a className="me-chip" href={href({ page: "dashboard" })} title={`${myStats.level.title} · ${myStats.xp} XP`}>
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
