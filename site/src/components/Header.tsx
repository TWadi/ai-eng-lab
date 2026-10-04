import type { AuthState } from "../hooks/useAuth";

interface Props {
  readonly auth: AuthState;
  readonly enabled: boolean;
}

export function Header({ auth, enabled }: Props) {
  const { session, profile, loading, signIn, signOut } = auth;
  const name = profile?.github_username ?? session?.user.user_metadata?.user_name ?? "you";

  return (
    <header className="top">
      <div className="brand">
        <span className="eyebrow">Two people · 40 weeks · in public</span>
        <h1>AI Engineering Lab</h1>
        <p className="lede">
          We're learning AI engineering from Python foundations to production LLM apps and agents.
          This page tracks where each of us is on the roadmap. Code lives in{" "}
          <a href="https://github.com/TWadi/ai-eng-lab" target="_blank" rel="noopener">TWadi/ai-eng-lab</a>.
        </p>
      </div>
      <div className="auth">
        {!enabled ? null : loading ? (
          <span className="muted">Checking sign-in…</span>
        ) : session ? (
          <div className="signed-in">
            <span>
              Signed in as <b>{name}</b>
            </span>
            <button type="button" className="ghost" onClick={signOut}>Sign out</button>
          </div>
        ) : (
          <button type="button" className="primary" onClick={signIn}>Sign in with GitHub</button>
        )}
      </div>
    </header>
  );
}
