// The RTE's port interfaces: the only way application components (swc/) reach infrastructure (bsw/).
// Like AUTOSAR ports:
//   - Sender/Receiver: load…() for the current value and watch…() for changes pushed later.
//   - Client/Server:   operations that return Outcome<T>; errors arrive as player-facing messages, never raw.
// bsw/ implements these; app/ wires one implementation in. Tests can wire fakes.
import type { QuizResult } from "../swc/logic/activity";
import type { Duel, DuelEntry } from "../swc/logic/duels";
import type { ProgressRow } from "../swc/logic/progress";
import type { ChallengeTest, RunResult, RunnerState } from "../swc/logic/lab/challenges";
import type { CellOutput, KernelState } from "../swc/logic/lab/kernel";
import type { ChatMessage, LlmCallbacks, LlmDevice } from "../swc/logic/lab/llm";
import type { Tokenized } from "../swc/logic/lab/tokenizer";
import type { Vec } from "../swc/logic/lab/vectors";
import type { AuthSession, ChallengeSolve, DuelGraded, DuelStart, GradedQuiz, OpenQuiz, Outcome, PlayersOverview, Profile, RaceSubmitted } from "../swc/logic/types";

/** Stops a subscription. */
export type Unsubscribe = () => void;

export interface AuthPort {
  currentSession(): Promise<AuthSession | null>;
  onSessionChange(cb: (session: AuthSession | null) => void): Unsubscribe;
  /** The signed-in user's own profile (also readable while waiting to be let in). */
  loadProfile(userId: string): Promise<Profile | null>;
  /** Fires when that profile changes (e.g. an admin lets them in). */
  watchProfile(userId: string, cb: () => void): Unsubscribe;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export interface ProgressPort {
  loadMembers(): Promise<Outcome<readonly Profile[]>>;
  loadProgress(): Promise<Outcome<readonly ProgressRow[]>>;
  watchProgress(cb: (row: ProgressRow) => void): Unsubscribe;
  /** A player joined or left the board. */
  watchMembers(cb: () => void): Unsubscribe;
  /** Mark an item done (allowed only once its quiz is passed, if it has one). */
  markDone(userId: string, itemId: string, doneAt: string): Promise<Outcome<null>>;
}

export interface QuizPort {
  loadResults(): Promise<Outcome<readonly QuizResult[]>>;
  /** Roadmap items that have questions in the bank. */
  loadQuizItems(): Promise<Outcome<readonly string[]>>;
  /** New or graded results; onReconnect means events may have been missed. */
  watchResults(cb: (result: QuizResult) => void, onReconnect: () => void): Unsubscribe;
  start(itemId: string): Promise<Outcome<OpenQuiz>>;
  submit(quizId: string, answers: readonly number[]): Promise<Outcome<GradedQuiz>>;
}

export interface DuelWatchers {
  readonly duel: (duel: Duel) => void;
  readonly entry: (entry: DuelEntry) => void;
  readonly reconnected: () => void;
}

export interface DuelPort {
  loadDuels(): Promise<Outcome<readonly Duel[]>>;
  loadEntries(): Promise<Outcome<readonly DuelEntry[]>>;
  loadDuel(duelId: string): Promise<Outcome<Duel | null>>;
  watch(watchers: DuelWatchers): Unsubscribe;
  /** Each returns the new duel's id. */
  create(itemId: string, opponentId: string): Promise<Outcome<string>>;
  createRace(opponentId: string): Promise<Outcome<string>>;
  respond(duelId: string, accept: boolean): Promise<Outcome<null>>;
  cancel(duelId: string): Promise<Outcome<null>>;
  start(duelId: string): Promise<Outcome<DuelStart>>;
  submit(duelId: string, answers: readonly number[]): Promise<Outcome<DuelGraded>>;
  submitRace(duelId: string, passed: boolean, code: string): Promise<Outcome<RaceSubmitted>>;
  /** Close a duel whose clock ran out (when the rival left). */
  finish(duelId: string): Promise<void>;
  /** After a race: each player's submitted code, by user id. */
  loadRaceSolutions(duelId: string): Promise<Outcome<ReadonlyMap<string, string>>>;
}

/** Ephemeral messages between the people in a duel (live progress). Nothing is stored. */
export interface LiveChannel<T> {
  send(message: T): void;
  leave(): void;
}

export interface LivePort {
  join<T>(topic: string, onMessage: (message: T) => void): LiveChannel<T>;
}

export interface PlayersPort {
  overview(): Promise<Outcome<PlayersOverview>>;
  invite(github: string): Promise<Outcome<{ readonly signedIn: boolean }>>;
  remove(github: string): Promise<Outcome<null>>;
  decline(github: string): Promise<Outcome<null>>;
}

export interface SolvesPort {
  load(): Promise<Outcome<readonly ChallengeSolve[]>>;
  watch(cb: (solve: ChallengeSolve) => void): Unsubscribe;
  /** Record a solve (succeeds if it already exists). */
  record(userId: string, challengeId: string, solvedAt: string): Promise<Outcome<null>>;
}

// ── Compute ports: Python, models and tokenizers running in the browser ──────────────────────────────
export interface PythonPort {
  run(code: string, tests: readonly ChallengeTest[], onState: (s: RunnerState) => void): Promise<RunResult>;
  /** Start downloading Python early (e.g. during a race countdown). */
  preload(): void;
}

export interface KernelPort {
  runCell(code: string, onState: (s: KernelState, detail?: string) => void): Promise<CellOutput>;
  /** Kill the kernel (all variables are lost). */
  restart(reason?: string): void;
}

export interface EmbedPort {
  embed(texts: readonly string[], onProgress: (pct: number) => void): Promise<Vec[]>;
}

export interface TokenizerPort {
  tokenize(model: string, text: string): Promise<Tokenized>;
}

export interface LlmPort {
  load(cb?: LlmCallbacks): Promise<LlmDevice>;
  generate(messages: readonly ChatMessage[], maxTokens: number, cb?: LlmCallbacks): Promise<string>;
  stop(): void;
}

/** Everything the application can reach. One instance per app, built in app/. */
export interface Rte {
  /** False when the site was built without database settings (it then only shows a notice). */
  readonly configured: boolean;
  readonly auth: AuthPort;
  readonly progress: ProgressPort;
  readonly quizzes: QuizPort;
  readonly duels: DuelPort;
  readonly live: LivePort;
  readonly players: PlayersPort;
  readonly solves: SolvesPort;
  readonly python: PythonPort;
  readonly kernel: KernelPort;
  readonly embedder: EmbedPort;
  readonly tokenizer: TokenizerPort;
  readonly llm: LlmPort;
}
