import { lockEndedMonths } from "../services/monthlyLeaderboard.service.js";

export async function runMonthlyLeaderboardLock(): Promise<{ locked: number }> {
  return lockEndedMonths();
}
