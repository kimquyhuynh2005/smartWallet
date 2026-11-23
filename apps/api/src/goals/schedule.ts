export const BEHIND_THRESHOLD = 0.2; // "more than 20% behind schedule"
export const MIN_ELAPSED = 0.1; // do not nag in the first 10% of a goal's time

export interface GoalClock { createdAt: Date; deadline: Date | null; targetAmount: bigint; savedAmount: bigint }

/**
 * GOAL-02 reminders. The schedule is a straight line from the day the goal was created to its deadline.
 *   expected = target x (time elapsed / total time)
 *   shortfall = (expected - saved) / expected
 * "Behind" = shortfall greater than 20%: you have saved less than 80% of what the schedule says you should have by now.
 * A goal past its deadline expects the full target.
 */
export function scheduleStatus(g: GoalClock, now: Date) {
  if (!g.deadline) return { elapsed: 0, expectedAmount: 0n, shortfallRatio: 0, behind: false };
  const total = g.deadline.getTime() - g.createdAt.getTime();
  const elapsed = total <= 0 ? 1 : Math.min(1, Math.max(0, (now.getTime() - g.createdAt.getTime()) / total));
  const expectedAmount = (g.targetAmount * BigInt(Math.round(elapsed * 1_000_000))) / 1_000_000n;
  const shortfallRatio = expectedAmount > 0n ? Number(expectedAmount - g.savedAmount) / Number(expectedAmount) : 0;
  const behind = g.savedAmount < g.targetAmount && elapsed >= MIN_ELAPSED && shortfallRatio > BEHIND_THRESHOLD;
  return { elapsed, expectedAmount, shortfallRatio, behind };
}
