/**
 * Chat-specific type definitions for Daedalus AI Orchestration System
 */

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessageStatus = "pending" | "streaming" | "complete" | "error";

export type VerificationType = "approval" | "correction" | "review";

export type VerificationResult = "approved" | "rejected" | "corrected";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  timestamp: string;
  metadata?: {
    taskId?: string;
    workflowId?: string;
    toolCalls?: ToolCall[];
    verificationResult?: VerificationResult;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "executing" | "complete" | "failed";
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  workflowId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationRequest {
  id: string;
  messageId: string;
  type: VerificationType;
  content: string;
  result?: VerificationResult;
  correctedContent?: string;
  resolve?: (verification: VerificationResult) => void;
  createdAt: string;
}

export interface WorkflowEngineConfig {
  messageStore: MessageStore;
  llmService: LLMService;
  documentStore: DocumentStore;
  maxSteps?: number;
  verificationTimeout?: number;
}

export interface ChatEngineConfig {
  messageStore: MessageStore;
  llmService: LLMService;
  documentStore: DocumentStore;
  maxSteps?: number;
  verificationTimeout?: number;
}

export interface ChatEngineState {
  isRunning: boolean;
  isPaused: boolean;
  currentTaskId?: string;
  workflowId?: string;
  pendingVerification?: VerificationRequest;
  error?: string;
}

export interface TaskStatus {
  id: string;
  status: "pending" | "executing" | "completed" | "failed";
  progress: number;
  result?: unknown;
}
