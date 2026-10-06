import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bigCelebration, popFrom } from "./celebrate";
import { phaseDone, playerStats, rankPlayers, type PlayerStats } from "./gamify";
import { useAuth } from "./hooks/useAuth";
import { useProgress } from "./hooks/useProgress";
import { useQuizzes } from "./hooks/useQuizzes";
import { useDuels } from "./hooks/useDuels";
import { useSolves } from "./hooks/useSolves";
import { findChallenge } from "./lab/challenges";
import { PLAYER_COLORS, type LabData } from "./lab";
import { PHASES, type RoadmapItem } from "./roadmap";
import { useRoute } from "./route";
import { supabase } from "./supabase";
import { QuizDialog } from "./components/QuizDialog";
import { ChallengeDialog } from "./components/ChallengeDialog";
import { ProfilePage } from "./pages/ProfilePage";
import { DuelCenter } from "./components/DuelCenter";
import { inviteExpired } from "./duels";
import { TopBar } from "./components/TopBar";
import { ActivityPage } from "./pages/ActivityPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RoadmapPage } from "./pages/RoadmapPage";

// The Lab pulls in a code editor and is only needed on its own page.
const LabPage = lazy(() => import("./lab/LabPage"));

interface Toast {
  readonly id: number;
  readonly title: string;
  readonly body: string;
}

export function App() {
  const auth = useAuth();
  const { members, progress, loading, error, toggle, reloadMembers } = useProgress();
  const quizzes = useQuizzes();
  const duels = useDuels();
  const solveState = useSolves();
  const route = useRoute();
  const [quizItem, setQuizItem] = useState<RoadmapItem | null>(null);
  const [challengeItem, setChallengeItem] = useState<RoadmapItem | null>(null);
  const [hiddenInvites, setHiddenInvites] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const me = auth.profile;
  const now = new Date();

  const stats = useMemo(
    () => new Map(members.map((m) => [m.id, playerStats(m.id, progress, quizzes.results, new Date(), duels.duels, solveState.solves)] as const)),
    [members, progress, quizzes.results, duels.duels, solveState.solves],
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

  const { record } = solveState;
  const onSolved = useCallback(
    (challengeId: string) => {
      if (!me) return;
      if (solveState.solves.some((s) => s.user_id === me.id && s.challenge_id === challengeId)) return;
      void record(me.id, challengeId).then((ok) => {
        if (!ok) return;
        bigCelebration();
        const c = findChallenge(challengeId);
        setToast({ id: Date.now(), title: "Challenge solved!", body: `${c?.title ?? "Nice"} · +${c?.xp ?? 0} XP` });
      });
    },
    [me, record, solveState.solves],
  );

  const showToast = useCallback((title: string, body: string) => setToast({ id: Date.now(), title, body }), []);
  const onDuelWin = useCallback(() => {
    bigCelebration();
    setToast({ id: Date.now(), title: "Duel won!", body: "+15 XP for the win." });
  }, []);
  const invites = me
    ? duels.duels.filter((d) => d.status === "pending" && d.opponent === me.id && !inviteExpired(d, now))
    : [];
  const showInvite = useCallback((duelId: string) => {
    setHiddenInvites((cur) => new Set([...cur].filter((id) => id !== duelId)));
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  }, []);

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
    onPlayDuel: me?.is_member ? showInvite : null,
    solves: solveState.solves,
    onPlayersChanged: reloadMembers,
    onSolved: me?.is_member ? onSolved : null,
  };
  const signedInNonMember = Boolean(auth.session) && !auth.loading && !me?.is_member;

  return (
    <div className="app">
      <TopBar
        page={route.page} auth={auth} enabled={Boolean(supabase)} myStats={myStats} myColor={me ? colorOf(me.id) : "var(--edge)"}
        invites={invites.length}
        onBell={() => (invites[0] ? showInvite(invites[0].id) : undefined)}
      />

      <main className="wrap" id="main">
        {!supabase && <p className="banner">Progress tracking isn't connected. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see site/README.md).</p>}
        {signedInNonMember && (
          <p className="banner">
            You're signed in. To play (tick quests, take quizzes, duel), ask TWadi or Ghassen to let you in. This page unlocks by itself once you're in. Until then you can watch the board.
          </p>
        )}
        {auth.error && <p className="banner error" role="alert">{auth.error}</p>}
        {error && <p className="banner error" role="alert">{error}</p>}

        {route.page === "dashboard" && <DashboardPage data={data} />}
        {route.page === "roadmap" && <RoadmapPage data={data} phaseId={route.phase} />}
        {route.page === "activity" && <ActivityPage data={data} />}
        {route.page === "player" && route.player && <ProfilePage data={data} username={route.player} />}
        {route.page === "lab" && (
          <Suspense fallback={<p className="muted">Opening the Lab…</p>}>
            <LabPage data={data} sub={route.lab} />
          </Suspense>
        )}
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
          onCreated={() => setChallengeItem(null)}
          onClose={() => setChallengeItem(null)}
        />
      )}

      {me?.is_member && (
        <DuelCenter
          me={me}
          duels={duels}
          memberById={memberById}
          colorOf={colorOf}
          hidden={hiddenInvites}
          onHide={(id) => setHiddenInvites((cur) => new Set([...cur, id]))}
          onToast={showToast}
          onWin={onDuelWin}
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
