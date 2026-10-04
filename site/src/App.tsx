import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bigCelebration, popFrom } from "./celebrate";
import { phaseDone, playerStats, rankPlayers, type PlayerStats } from "./gamify";
import { useAuth } from "./hooks/useAuth";
import { useProgress } from "./hooks/useProgress";
import { useQuizzes } from "./hooks/useQuizzes";
import { useDuels, type DuelResult } from "./hooks/useDuels";
import { PLAYER_COLORS, type LabData } from "./lab";
import { PHASES, type RoadmapItem } from "./roadmap";
import { useRoute } from "./route";
import { supabase } from "./supabase";
import { QuizDialog } from "./components/QuizDialog";
import { ChallengeDialog } from "./components/ChallengeDialog";
import { ProfilePage } from "./pages/ProfilePage";
import { findRoadmapItem } from "./activity";
import { formatTime } from "./duels";
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
  const duels = useDuels();
  const route = useRoute();
  const [quizItem, setQuizItem] = useState<RoadmapItem | null>(null);
  const [challengeItem, setChallengeItem] = useState<RoadmapItem | null>(null);
  const [duelId, setDuelId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const me = auth.profile;
  const now = new Date();

  const stats = useMemo(
    () => new Map(members.map((m) => [m.id, playerStats(m.id, progress, quizzes.results, new Date(), duels.duels)] as const)),
    [members, progress, quizzes.results, duels.duels],
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

  const seenDuels = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!me) return;
    const won = duels.duels.filter((d) => d.status === "done" && d.winner === me.id).map((d) => d.id);
    if (seenDuels.current === null) {
      seenDuels.current = new Set(won);
      return;
    }
    const fresh = won.filter((id) => !seenDuels.current!.has(id));
    fresh.forEach((id) => seenDuels.current!.add(id));
    if (fresh.length > 0) {
      bigCelebration();
      setToast({ id: Date.now(), title: "Duel won!", body: "+15 XP. Check the Duels panel for the score." });
    }
  }, [duels.duels, me]);

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
    duels: duels.duels, duelEntries: duels.entries,
    onDuel: me?.is_member ? setChallengeItem : null,
    onPlayDuel: me?.is_member ? setDuelId : null,
  };
  const playingDuel = duelId ? duels.duels.find((d) => d.id === duelId) : undefined;
  const duelRival = playingDuel && me ? memberById(playingDuel.challenger === me.id ? playingDuel.opponent : playingDuel.challenger) : undefined;
  const duelVerdict = (r: DuelResult) => {
    const rivalName = duelRival?.github_username ?? "your rival";
    if (r.status === "open") return `Locked in at ${formatTime(r.time_ms)}. Waiting for ${rivalName} to play.`;
    const line = `${r.score}–${r.opponent_score} (${formatTime(r.time_ms)} vs ${formatTime(r.opponent_time_ms)})`;
    if (r.winner === null) return `Draw! ${line}. +5 XP.`;
    return r.winner === me?.id ? `You won! ${line}. +15 XP.` : `${rivalName} wins this one. ${line}.`;
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
        {route.page === "player" && route.player && <ProfilePage data={data} username={route.player} />}
      </main>

      {quizItem && (
        <QuizDialog
          key={quizItem.id}
          eyebrow="Quiz"
          title={quizItem.title}
          loadingText="Picking 5 questions…"
          start={() => quizzes.start(quizItem)}
          submit={quizzes.submit}
          canRetry
          onClose={() => setQuizItem(null)}
          onPerfect={bigCelebration}
        />
      )}

      {challengeItem && me && (
        <ChallengeDialog
          key={challengeItem.id}
          item={challengeItem}
          rivals={members.filter((m) => m.id !== me.id)}
          colorOf={colorOf}
          create={duels.create}
          onCreated={(id) => { setChallengeItem(null); setDuelId(id); }}
          onClose={() => setChallengeItem(null)}
        />
      )}

      {duelId && (
        <QuizDialog<DuelResult>
          key={duelId}
          eyebrow={duelRival ? `Duel vs ${duelRival.github_username}` : "Duel"}
          title={findRoadmapItem(playingDuel?.item_id ?? "")?.title ?? "Quiz duel"}
          loadingText="Get ready… the clock starts when the questions appear."
          start={() => duels.start(duelId)}
          submit={duels.submit}
          timed
          verdict={duelVerdict}
          onClose={() => setDuelId(null)}
          onPerfect={() => undefined}
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
