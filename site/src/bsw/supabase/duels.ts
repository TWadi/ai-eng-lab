import type { SupabaseClient } from "@supabase/supabase-js";
import type { DuelPort, LivePort } from "../../rte/ports";
import type { Duel, DuelEntry } from "../../swc/logic/duels";
import { fail, ok, type Outcome, type QuizQuestion, type RaceSubmitted } from "../../swc/logic/types";
import { failed } from "./errors";
import { toGraded, type SubmitResult } from "./quizzes";
import { watchTables } from "./realtime";

const DUEL_COLUMNS = "id,kind,item_id,challenge_id,challenger,opponent,status,winner,created_at,completed_at,starts_at";
const ENTRY_COLUMNS = "duel_id,user_id,started_at,submitted_at,score,time_ms";
const OVER = "This duel is already over";

interface StartReply {
  readonly starts_at: string;
  readonly ends_at?: string;
  readonly server_now: string;
  readonly questions?: QuizQuestion[] | null;
  readonly challenge_id?: string | null;
  readonly over?: boolean;
}

/** Quiz duels and code races: invitations, the shared clock and grading all run in the database. */
export function supabaseDuels(client: SupabaseClient): DuelPort {
  const call = async <T,>(fn: string, args: Record<string, unknown>, fallback: string): Promise<Outcome<T>> => {
    const { data, error } = await client.rpc(fn, args);
    return error ? failed(fn, error, fallback) : ok(data as T);
  };

  return {
    async loadDuels() {
      const { data, error } = await client.from("duels").select(DUEL_COLUMNS).order("created_at", { ascending: false }).limit(500);
      return error ? failed("Loading duels", error, "Couldn't load duels.") : ok(data as Duel[]);
    },

    async loadEntries() {
      const { data, error } = await client.from("duel_entries").select(ENTRY_COLUMNS).limit(1000);
      return error ? failed("Loading duel entries", error, "Couldn't load duel results.") : ok(data as DuelEntry[]);
    },

    async loadDuel(duelId) {
      const { data, error } = await client.from("duels").select(DUEL_COLUMNS).eq("id", duelId).maybeSingle();
      return error ? failed("Loading a duel", error, "Couldn't load that duel.") : ok(data as Duel | null);
    },

    watch(w) {
      return watchTables(client, "duel-changes", [
        { table: "duels", on: (p) => { if (p.eventType !== "DELETE") w.duel(p.new as unknown as Duel); } },
        { table: "duel_entries", on: (p) => { if (p.eventType !== "DELETE") w.entry(p.new as unknown as DuelEntry); } },
      ], w.reconnected);
    },

    async create(itemId, opponentId) {
      const res = await call<{ id: string }>("create_duel", { p_item: itemId, p_opponent: opponentId }, "Couldn't send the challenge. Try again.");
      return res.ok ? ok(res.value.id) : res;
    },

    async createRace(opponentId) {
      const res = await call<{ id: string }>("create_race", { p_opponent: opponentId }, "Couldn't send the race challenge. Try again.");
      return res.ok ? ok(res.value.id) : res;
    },

    async respond(duelId, accept) {
      const res = await call<unknown>("respond_duel", { p_duel: duelId, p_accept: accept }, "Couldn't answer the challenge. Try again.");
      return res.ok ? ok(null) : res;
    },

    async cancel(duelId) {
      const res = await call<unknown>("cancel_duel", { p_duel: duelId }, "Couldn't cancel the challenge. Try again.");
      return res.ok ? ok(null) : res;
    },

    async start(duelId) {
      const res = await call<StartReply>("start_duel", { p_duel: duelId }, "Couldn't open the duel. Try again.");
      if (!res.ok) return res;
      const r = res.value;
      if (r.over) return fail(OVER);
      // server time minus local time, so countdowns agree across both players' computers.
      const serverOffset = new Date(r.server_now).getTime() - Date.now();
      const startsAt = new Date(r.starts_at).getTime();
      if (!r.ends_at) return ok({ kind: "wait", startsAt, serverOffset });
      const endsAt = new Date(r.ends_at).getTime();
      if (r.challenge_id) return ok({ kind: "race", startsAt, endsAt, serverOffset, challengeId: r.challenge_id });
      return ok({ kind: "play", startsAt, endsAt, serverOffset, questions: r.questions ?? [] });
    },

    async submit(duelId, answers) {
      const res = await call<(SubmitResult & { time_ms: number }) | { over: true }>(
        "submit_duel", { p_duel: duelId, p_answers: answers }, "Couldn't submit your answers. Try again.",
      );
      if (!res.ok) return res;
      if ("over" in res.value) return fail(OVER);
      return ok({ ...toGraded(res.value), time_ms: res.value.time_ms });
    },

    async submitRace(duelId, passed, code) {
      const res = await call<RaceSubmitted | { over: true }>(
        "submit_race", { p_duel: duelId, p_passed: passed, p_code: code }, "Couldn't send your result. Try again.",
      );
      if (!res.ok) return res;
      if ("over" in res.value) return fail("This race is already over");
      return ok(res.value);
    },

    async finish(duelId) {
      await call<string>("finish_duel", { p_duel: duelId }, "");
    },

    async loadRaceSolutions(duelId) {
      const { data, error } = await client.from("duel_entries").select("user_id,answers").eq("duel_id", duelId);
      if (error) return failed("Loading race solutions", error, "Couldn't load the solutions.");
      const rows = (data ?? []) as Array<{ user_id: string; answers: { code?: unknown } | null }>;
      return ok(new Map(rows.flatMap((r) => (typeof r.answers?.code === "string" ? [[r.user_id, r.answers.code] as const] : []))));
    },
  };
}

/** Broadcast channels: live progress between duel players, never stored. */
export function supabaseLive(client: SupabaseClient): LivePort {
  return {
    join<T>(topic: string, onMessage: (message: T) => void) {
      const channel = client.channel(topic, { config: { broadcast: { self: false } } });
      channel.on("broadcast", { event: "message" }, ({ payload }) => onMessage(payload as T)).subscribe();
      return {
        send: (message: T) => void channel.send({ type: "broadcast", event: "message", payload: message }),
        leave: () => void client.removeChannel(channel),
      };
    },
  };
}
