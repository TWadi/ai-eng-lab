import { Header } from "./components/Header";
import { NotesWorkspace } from "./components/notes/NotesWorkspace";
import { PersonCard } from "./components/PersonCard";
import { PhaseCard } from "./components/PhaseCard";
import { useAuth } from "./hooks/useAuth";
import { useHashTab } from "./hooks/useHashTab";
import { usePages } from "./hooks/usePages";
import { useProgress } from "./hooks/useProgress";
import { phaseForWeek, weekNumber, weekStart } from "./progress";
import { PHASES, START_DATE, TOTAL_WEEKS } from "./roadmap";
import { supabase } from "./supabase";

function weekLabel(week: number): string {
  if (week < 1) {
    const start = weekStart(START_DATE, 1).toLocaleDateString(undefined, { day: "numeric", month: "long" });
    return `Starts ${start}`;
  }
  return week > TOTAL_WEEKS ? "Track finished" : `Week ${week} of ${TOTAL_WEEKS}`;
}

export function App() {
  const auth = useAuth();
  const { members, progress, loading, error, toggle } = useProgress();
  const pagesState = usePages();
  const tab = useHashTab();
  const week = weekNumber(START_DATE, new Date());
  const current = phaseForWeek(PHASES, week);
  const me = auth.profile;
  const signedInNonMember = Boolean(auth.session) && !auth.loading && !me?.is_member;

  return (
    <div className="wrap">
      <Header auth={auth} enabled={Boolean(supabase)} />

      {!supabase && (
        <p className="banner">Progress tracking isn't connected yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see site/README.md).</p>
      )}
      {signedInNonMember && (
        <p className="banner">You're signed in, but only the two lab members can tick items. You can still follow along here.</p>
      )}
      {auth.error && <p className="banner error" role="alert">{auth.error}</p>}
      {error && <p className="banner error" role="alert">{error}</p>}

      <section className="people" aria-label="Progress per person">
        {!supabase ? null : loading ? (
          <p className="muted">Loading progress…</p>
        ) : members.length === 0 ? (
          <p className="muted">No one has signed in yet. Members appear here after their first GitHub sign-in.</p>
        ) : (
          members.map((m) => <PersonCard key={m.id} member={m} done={progress[m.id]} isMe={m.id === me?.id} />)
        )}
      </section>

      <nav className="tabs" aria-label="Sections">
        <a href="#roadmap" aria-current={tab === "roadmap" ? "page" : undefined}>Roadmap</a>
        <a href="#notes" aria-current={tab === "notes" ? "page" : undefined}>
          Notes{pagesState.pages.length > 0 && <span className="tab-count">{pagesState.pages.length}</span>}
        </a>
      </nav>

      {tab === "notes" ? (
        <NotesWorkspace pagesState={pagesState} members={members} me={me} />
      ) : (
      <div className="layout">
        <nav className="rail" aria-label="Phases">
          <div className="today">{weekLabel(week)}</div>
          {PHASES.map((p) => (
            <a key={p.id} href={`#${p.id}`} className={current?.id === p.id ? "now" : ""}>
              <span className="code">{p.short}</span>
              <span>{p.title.split(":")[0]}</span>
            </a>
          ))}
        </nav>
        <main className="phases">
          {PHASES.map((p) => (
            <PhaseCard
              key={p.id}
              phase={p}
              isCurrent={current?.id === p.id}
              members={members}
              progress={progress}
              me={me}
              onToggle={(itemId, done) => me && toggle(me.id, itemId, done)}
            />
          ))}
        </main>
      </div>
      )}

      <footer className="foot">
        Built by TWadi and GhassenJamoussi99 · Hosted on GitHub Pages · Data in Supabase
      </footer>
    </div>
  );
}
