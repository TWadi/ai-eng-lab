import { useCallback, useEffect, useRef, useState } from "react";
import { groupByUser, withItem, type ProgressByUser } from "../swc/logic/progress";
import type { Profile } from "../swc/logic/types";
import { useRte } from "./RteContext";

export interface ProgressState {
  readonly members: readonly Profile[];
  readonly progress: ProgressByUser;
  readonly loading: boolean;
  readonly error: string | null;
  /** Mark an item done (finished items stay finished). */
  readonly markDone: (userId: string, itemId: string) => Promise<void>;
  /** Re-read the player list (e.g. after an admin let someone in). */
  readonly reloadMembers: () => Promise<void>;
}

export function useProgress(): ProgressState {
  const { progress: port, configured } = useRte();
  const [members, setMembers] = useState<readonly Profile[]>([]);
  const [progress, setProgress] = useState<ProgressByUser>({});
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const reloadMembers = useCallback(async () => {
    const res = await port.loadMembers();
    if (res.ok) setMembers(res.value);
  }, [port]);

  useEffect(() => {
    let active = true;
    void Promise.all([port.loadMembers(), port.loadProgress()]).then(([m, p]) => {
      if (!active) return;
      if (m.ok && p.ok) {
        setMembers(m.value);
        setProgress(groupByUser(p.value));
      } else {
        setError("Couldn't load progress. Refresh to try again.");
      }
      setLoading(false);
    });
    const stopProgress = port.watchProgress((r) => setProgress((cur) => withItem(cur, r.user_id, r.item_id, r.done_at)));
    // A player was let in (or removed): refresh the board.
    const stopMembers = port.watchMembers(() => void reloadMembers());
    return () => {
      active = false;
      stopProgress();
      stopMembers();
    };
  }, [port, reloadMembers]);

  const markDone = useCallback(async (userId: string, itemId: string) => {
    const before = progressRef.current;
    const doneAt = new Date().toISOString();
    setError(null);
    setProgress(withItem(before, userId, itemId, doneAt));
    const res = await port.markDone(userId, itemId, doneAt);
    if (!res.ok) {
      setProgress(before);
      setError(res.error);
    }
  }, [port]);

  return { members, progress, loading, error, markDone, reloadMembers };
}
