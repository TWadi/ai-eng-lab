import { fail, ok } from "../swc/logic/types";
import type { AuthPort, DuelPort, LivePort, PlayersPort, ProgressPort, QuizPort, SolvesPort } from "../rte/ports";

const OFFLINE = "The site isn't connected to its database.";
const none = () => () => undefined;

/** Data ports for a build without database settings: everything reads empty, every action explains why. */
export const offline = {
  auth: {
    currentSession: async () => null,
    onSessionChange: none,
    loadProfile: async () => null,
    watchProfile: none,
    signIn: async () => undefined,
    signOut: async () => undefined,
  } satisfies AuthPort,
  progress: {
    loadMembers: async () => ok([]),
    loadProgress: async () => ok([]),
    watchProgress: none,
    watchMembers: none,
    markDone: async () => fail(OFFLINE),
  } satisfies ProgressPort,
  quizzes: {
    loadResults: async () => ok([]),
    loadQuizItems: async () => ok([]),
    watchResults: none,
    start: async () => fail(OFFLINE),
    submit: async () => fail(OFFLINE),
  } satisfies QuizPort,
  duels: {
    loadDuels: async () => ok([]),
    loadEntries: async () => ok([]),
    loadDuel: async () => ok(null),
    watch: none,
    create: async () => fail(OFFLINE),
    createRace: async () => fail(OFFLINE),
    respond: async () => fail(OFFLINE),
    cancel: async () => fail(OFFLINE),
    start: async () => fail(OFFLINE),
    submit: async () => fail(OFFLINE),
    submitRace: async () => fail(OFFLINE),
    finish: async () => undefined,
    loadRaceSolutions: async () => ok(new Map()),
  } satisfies DuelPort,
  live: {
    join: () => ({ send: () => undefined, leave: () => undefined }),
  } satisfies LivePort,
  players: {
    overview: async () => fail(OFFLINE),
    invite: async () => fail(OFFLINE),
    remove: async () => fail(OFFLINE),
    decline: async () => fail(OFFLINE),
  } satisfies PlayersPort,
  solves: {
    load: async () => ok([]),
    watch: none,
    record: async () => fail(OFFLINE),
  } satisfies SolvesPort,
};
