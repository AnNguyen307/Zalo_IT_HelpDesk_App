export type TicketStatus = "open" | "waiting_user" | "in_progress" | "resolved" | "closed";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface User {
  id: string;
  zaloUserId?: string;
  name: string;
  avatar?: string;
  phone?: string;
  department?: string;
  role: "user" | "admin";
}

export interface AiAnalysis {
  source: string;
  model?: string | null;
  generatedAt?: string;
  latencyMs?: number;
  outcome?: "need_info" | "guide_user" | "escalate" | "likely_resolved";
  reply?: string;
  category: string;
  priority: Priority;
  risk: "low" | "medium" | "high";
  confidence: number;
  summary: string;
  steps: string[];
  questions: string[];
  canAutoHandle: boolean;
  escalated: boolean;
  reason: string;
  escalationCode?: "no_playbook_match" | "playbook_not_auto_eligible" | "low_confidence" | "agent_unavailable" | "policy_blocked" | null;
  kbIds?: string[];
  playbookIds?: string[];
  playbookSources?: Array<{ id: string; title?: string; version?: string; score?: number; sourceType?: string }>;
}

export interface SlaInfo {
  startedAt: string;
  priority: Priority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstRespondedAt?: string | null;
  firstResponseBreachedAt?: string | null;
  resolutionBreachedAt?: string | null;
  firstResponseOverdue: boolean;
  resolutionOverdue: boolean;
  overdue: boolean;
}

export interface Satisfaction {
  score: number;
  comment?: string;
  ratedAt: string;
  ratedBy?: string;
}

export interface HumanHandoff {
  locked: boolean;
  aiParticipationAllowed: boolean;
  at?: string | null;
  reason?: string | null;
  by?: string | null;
  byName?: string | null;
}

export interface Ticket {
  id: string;
  code: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  risk: string;
  status: TicketStatus;
  location?: string;
  device?: string;
  assignedTo?: string;
  aiAnalysis?: AiAnalysis;
  humanHandoff?: HumanHandoff;
  resolution?: string;
  satisfaction?: Satisfaction | null;
  reopenCount?: number;
  lastReopenedAt?: string | null;
  sla: SlaInfo;
  attachmentCount?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface Message {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  role: "user" | "assistant" | "technician" | "system";
  body: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  ticketId: string;
  messageId?: string | null;
  uploaderId: string;
  uploaderName: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface TicketHistory {
  id: string;
  ticketId: string;
  actorId: string;
  actorName: string;
  type: string;
  from?: string | null;
  to?: string | null;
  note?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  ticketId?: string;
  type: string;
  title: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
}

export type Page = "home" | "tickets" | "new" | "detail" | "notifications" | "profile";
