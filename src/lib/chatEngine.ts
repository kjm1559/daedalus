import { v4 as uuidv4 } from "uuid";
import {
  ChatEngineConfig,
  ChatMessage,
  ChatSession,
  VerificationRequest,
  VerificationResult,
  WorkflowEngine,
  Task,
} from "@/types";
import { MessageStore } from "./messageStore";
import { LLMService } from "./llm";
import { DocumentStore } from "./documentStore";

export class ChatEngine {
  private messageStore: MessageStore;
  private llmService: LLMService;
  private documentStore: DocumentStore;
  private workflowEngine: WorkflowEngine;
  private maxSteps: number;
  private verificationTimeout: number;
  private currentSession: ChatSession | null = null;

  constructor(config: ChatEngineConfig) {
    this.messageStore = config.messageStore;
    this.llmService = config.llmService;
    this.documentStore = config.documentStore;
    this.maxSteps = config.maxSteps || 50;
    this.verificationTimeout = config.verificationTimeout || 300000;

    this.workflowEngine = new WorkflowEngine({
      documentStore: this.documentStore,
      llmService: this.llmService,
      maxSteps: this.maxSteps,
    });
  }

  async processMessage(content: string): Promise<ChatMessage> {
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content,
      status: "complete",
      timestamp: new Date().toISOString(),
    };

    if (this.currentSession) {
      await this.messageStore.saveMessage(this.currentSession.id, userMessage);
    }

    // Parse user intent and create workflow
    const workflow = await this.createWorkflowFromMessage(content);

    // Execute workflow
    const result = await this.executeWorkflow(workflow);

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: result.summary,
      status: "complete",
      timestamp: new Date().toISOString(),
      metadata: {
        workflowId: workflow.id,
        toolCalls: result.toolCalls,
        verificationResult: result.verificationResult,
      },
    };

    if (this.currentSession) {
      await this.messageStore.saveMessage(
        this.currentSession.id,
        assistantMessage,
      );
    }

    return assistantMessage;
  }

  private async createWorkflowFromMessage(content: string): Promise<Workflow> {
    // Parse user intent and create workflow
    const systemPrompt = `You are a workflow planner. Analyze the user's request and create a structured workflow.

User request: ${content}

Output format:
- Title: Brief description of the task
- Tasks: Array of tasks to complete
  Each task should have:
  - title: Task name
  - description: What needs to be done
  - dependencies: Array of task IDs this depends on`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content },
    ];

    const response = await this.llmService.chat(messages);

    // Parse response into workflow
    const workflow = this.parseWorkflowResponse(response);
    return workflow;
  }

  private parseWorkflowResponse(response: string): Workflow {
    // Simplified parsing - in production, use proper JSON parsing
    // This is a placeholder for actual parsing logic
    return {
      id: uuidv4(),
      title: "Generated Workflow",
      state: "planning" as const,
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private async executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    // Execute workflow steps
    const result: WorkflowResult = {
      summary: "",
      toolCalls: [],
      verificationResult: "approved",
    };

    for (const task of workflow.tasks) {
      const toolCall: ToolCall = {
        id: uuidv4(),
        name: "execute_task",
        arguments: { task },
        status: "executing",
      };

      try {
        const taskResult = await this.workflowEngine.executeTask(task);
        toolCall.result = taskResult;
        toolCall.status = "complete";
      } catch (error) {
        toolCall.status = "failed";
        toolCall.result = { error: (error as Error).message };
      }

      result.toolCalls.push(toolCall);
    }

    result.summary = `Completed ${workflow.tasks.length} tasks. ${workflow.tasks.length} tools executed.`;

    return result;
  }

  async createSession(title: string): Promise<ChatSession> {
    const session = await this.messageStore.createSession(title);
    this.currentSession = session;
    return session;
  }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const session = await this.messageStore.loadSession(sessionId);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  getSession(): ChatSession | null {
    return this.currentSession;
  }

  getMessages(): ChatMessage[] {
    return this.currentSession?.messages || [];
  }

  getState(): ChatEngineState {
    return {
      isRunning: this.workflowEngine.getState() === "running",
      isPaused: this.workflowEngine.getState() === "paused",
      currentTaskId: this.workflowEngine.getCurrentTaskId(),
      workflowId: this.currentSession?.workflowId,
      pendingVerification: undefined,
      error: undefined,
    };
  }
}

export interface Workflow {
  id: string;
  title: string;
  state: "planning" | "executing" | "completed" | "failed";
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
}

export interface WorkflowResult {
  summary: string;
  toolCalls: ToolCall[];
  verificationResult: VerificationResult;
}
