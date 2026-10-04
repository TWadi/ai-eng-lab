import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bigCelebration, popFrom } from "./celebrate";
import { phaseDone, playerStats, rankPlayers, type PlayerStats } from "./gamify";
import { useAuth } from "./hooks/useAuth";
import { useProgress } from "./hooks/useProgress";
import { useQuizzes } from "./hooks/useQuizzes";
import { PLAYER_COLORS, type LabData } from "./lab";
import { PHASES, type RoadmapItem } from "./roadmap";
import { useRoute } from "./route";
import { supabase } from "./supabase";
import { QuizDialog } from "./components/QuizDialog";
import { TopBar } from "./components/TopBar";
import { ActivityPage } from "./pages/ActivityPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RoadmapPage } from "./pages/RoadmapPage";

interface Toast {
  readonly id: number;
  readonly title: string;
  readonly body: string;
}

export function App() {
  const auth = useAuth();
  const { members, progress, loading, error, toggle } = useProgress();
  const quizzes = useQuizzes();
  const route = useRoute();
  const [quizItem, setQuizItem] = useState<RoadmapItem | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const me = auth.profile;
  const now = new Date();

  const stats = useMemo(
    () => new Map(members.map((m) => [m.id, playerStats(m.id, progress, quizzes.results, new Date())] as const)),
    [members, progress, quizzes.results],
  );
  const ranked = useMemo(() => rankPlayers([...stats.values()]), [stats]);
  const colorOf = useCallback(
    (userId: string) => PLAYER_COLORS[Math.max(0, members.findIndex((m) => m.id === userId)) % PLAYER_COLORS.length],
    [members],
  );
  const memberById = useCallback((userId: string) => members.find((m) => m.id === userId), [members]);
  const myStats: PlayerStats | undefined = me ? stats.get(me.id) : undefined;

  // Celebrate when my level goes up (but not on first load).
  const lastLevel = useRef<number | null>(null);
  useEffect(() => {
    if (!myStats) return;
    const prev = lastLevel.current;
    lastLevel.current = myStats.level.level;
    if (prev !== null && myStats.level.level > prev) {
      bigCelebration();
      setToast({ id: Date.now(), title: `Level ${myStats.level.level}!`, body: `You're now a ${myStats.level.title}.` });
    }
  }, [myStats]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const onToggle = useCallback(
    (itemId: string, done: boolean, el: Element | null) => {
      if (!me) return;
      if (done) {
        const phase = PHASES.find((p) => p.items.some((i) => i.id === itemId));
        const after = { ...(progress[me.id] ?? {}), [itemId]: new Date().toISOString() };
        if (phase && phaseDone(phase, after)) {
          bigCelebration();
          setToast({ id: Date.now(), title: "Phase cleared!", body: `${phase.title} is done. +50 XP bonus.` });
        } else {
          popFrom(el);
        }
      }
      void toggle(me.id, itemId, done);
    },
    [me, progress, toggle],
  );

  const data: LabData = {
    members, progress, quizResults: quizzes.results, quizAvailable: quizzes.available, stats, ranked, me, now, loading,
    colorOf, memberById,
    onToggle: me?.is_member ? onToggle : null,
    onQuiz: me?.is_member ? setQuizItem : null,
  };
  const signedInNonMember = Boolean(auth.session) && !auth.loading && !me?.is_member;

  return (
    <div className="app">
      <TopBar page={route.page} auth={auth} enabled={Boolean(supabase)} myStats={myStats} myColor={me ? colorOf(me.id) : "var(--edge)"} />

      <main className="wrap" id="main">
        {!supabase && <p className="banner">Progress tracking isn't connected. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see site/README.md).</p>}
        {signedInNonMember && <p className="banner">You're signed in, but only lab members can play. You can still watch the board.</p>}
        {auth.error && <p className="banner error" role="alert">{auth.error}</p>}
        {error && <p className="banner error" role="alert">{error}</p>}

        {route.page === "dashboard" && <DashboardPage data={data} />}
        {route.page === "roadmap" && <RoadmapPage data={data} phaseId={route.phase} />}
        {route.page === "activity" && <ActivityPage data={data} />}
      </main>

      {quizItem && (
        <QuizDialog
          key={quizItem.id}
          item={quizItem}
          quizzes={quizzes}
          onClose={() => setQuizItem(null)}
          onPerfect={bigCelebration}
        />
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <b>{toast.title}</b>
          <span>{toast.body}</span>
        </div>
      )}

      <footer className="foot">
        Built by TWadi, GhassenJamoussi99 and bravo421 · <a href="https://github.com/TWadi/ai-eng-lab" target="_blank" rel="noopener">Code on GitHub</a>
      </footer>
    </div>
  );
}
