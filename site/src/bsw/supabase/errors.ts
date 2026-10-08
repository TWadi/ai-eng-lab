import { fail, type Outcome } from "../../swc/logic/types";

interface DbError {
  readonly message?: string;
  readonly code?: string;
}

/** Exceptions our database raises on purpose (P0001) carry a message meant for the player; anything else is generic. */
export function playerMessage(err: DbError | null, fallback: string): string {
  return err?.code === "P0001" && err.message ? err.message : fallback;
}

/** Log the technical error, return the player-facing one. */
export function failed<T>(what: string, err: DbError | null, fallback: string): Outcome<T> {
  console.error(`${what} failed`, err);
  return fail(playerMessage(err, fallback));
}

/** Postgres unique violation: the row already exists. */
export function isDuplicate(err: DbError | null): boolean {
  return err?.code === "23505";
}
