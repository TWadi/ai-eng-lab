import type { Rte } from "../rte/ports";
import { compute } from "./compute";
import { offline } from "./offline";
import { supabaseAuth } from "./supabase/auth";
import { supabaseClient } from "./supabase/client";
import { supabaseDuels, supabaseLive } from "./supabase/duels";
import { supabasePlayers } from "./supabase/players";
import { supabaseProgress } from "./supabase/progress";
import { supabaseQuizzes } from "./supabase/quizzes";
import { supabaseSolves } from "./supabase/solves";

/** The basic software: real implementations of every RTE port. */
export function createRte(): Rte {
  const client = supabaseClient;
  if (!client) return { configured: false, ...offline, ...compute };
  return {
    configured: true,
    auth: supabaseAuth(client),
    progress: supabaseProgress(client),
    quizzes: supabaseQuizzes(client),
    duels: supabaseDuels(client),
    live: supabaseLive(client),
    players: supabasePlayers(client),
    solves: supabaseSolves(client),
    ...compute,
  };
}
