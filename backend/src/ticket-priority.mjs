export const DEFAULT_TICKET_PRIORITY = "normal";

const TICKET_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

export function priorityFromAgentAnalysis(analysis) {
  if (!analysis || analysis.priorityDetermined !== true) return DEFAULT_TICKET_PRIORITY;
  return TICKET_PRIORITIES.has(analysis.priority) ? analysis.priority : DEFAULT_TICKET_PRIORITY;
}
