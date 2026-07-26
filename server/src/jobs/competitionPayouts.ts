import { processEndedCompetitions } from "../services/competition.service.js";

export async function runCompetitionPayouts(): Promise<{ processed: number }> {
  return processEndedCompetitions();
}
