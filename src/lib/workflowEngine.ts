import {
  Workflow,
  Task,
  createWorkflow,
  VerificationResult,
} from "@/lib/workflow";
import { DocumentStore } from "@/lib/documentStore";
import { LLMService, Message } from "@/lib/llm";
import { Document } from "@/types/document";

export type { Task };

export interface WorkflowEngineConfig {
  documentStore: DocumentStore;
  llmService: LLMService;
  maxSteps?: number;
  verificationTimeout?: number;
}

export type WorkflowEngineState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export class WorkflowEngine {
  private workflow: Workflow;
  private documentStore: DocumentStore;
  private llmService: LLMService;
  private maxSteps: number;
  private verificationTimeout: number;
  private state: WorkflowEngineState = "idle";
  private stepCount: number = 0;
  private currentTask: Task | null = null;

  constructor(config: WorkflowEngineConfig) {
    this.workflow = createWorkflow("Daedalus Workflow");
    this.documentStore = config.documentStore;
    this.llmService = config.llmService;
    this.maxSteps = config.maxSteps || 50;
    this.verificationTimeout = config.verificationTimeout || 300000;
  }

  getWorkflow(): Workflow {
    return this.workflow;
  }

  getState(): WorkflowEngineState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.workflow.tasks.length === 0) {
      throw new Error("No tasks in workflow");
    }

    if (
      this.state !== "idle" &&
      this.state !== "completed" &&
      this.state !== "failed"
    ) {
      throw new Error("Workflow is already running");
    }

    this.workflow = { ...this.workflow, state: "executing" };
    this.state = "running";
    this.stepCount = 0;

    await this.executeNextTask();
  }

  async pause(): Promise<void> {
    if (this.state !== "running") return;
    this.state = "paused";
  }

  async resume(): Promise<void> {
    if (this.state !== "paused") return;
    this.state = "running";
    await this.executeNextTask();
  }

  async stop(): Promise<void> {
    this.state = "failed";
    this.workflow = {
      ...this.workflow,
      state: "failed",
    };
  }

  private async executeNextTask(): Promise<void> {
    if (this.state !== "running") return;
    if (this.stepCount >= this.maxSteps) {
      await this.stop();
      return;
    }

    const nextTask = this.getNextPendingTask();
    if (!nextTask) {
      await this.completeWorkflow();
      return;
    }

    this.currentTask = nextTask;
    this.workflow = {
      ...this.workflow,
      currentTaskId: nextTask.id,
    };

    this.stepCount++;

    try {
      const result = await this.executeTask(nextTask);

      if (result.status === "passed") {
        this.workflow = {
          ...this.workflow,
          tasks: this.workflow.tasks.map((t) =>
            t.id === nextTask.id
              ? {
                  ...t,
                  status: "completed" as const,
                  completedAt: new Date().toISOString(),
                }
              : t,
          ),
        };
        await this.executeNextTask();
      } else {
        this.state = "failed";
        this.workflow = {
          ...this.workflow,
          state: "failed",
        };
      }
    } catch (error) {
      console.error(`Task ${nextTask.id} failed:`, error);
      this.state = "failed";
      this.workflow = {
        ...this.workflow,
        state: "failed",
      };
    }
  }

  private getNextPendingTask(): Task | null {
    if (this.state !== "running") return null;

    const pendingTasks = this.workflow.tasks.filter(
      (t) =>
        t.status === "pending" &&
        t.dependencies.every((depId) => {
          const dep = this.workflow.tasks.find((t) => t.id === depId);
          return dep?.status === "completed";
        }),
    );

    return pendingTasks[0] || null;
  }

  public async executeTask(
    task: Task,
  ): Promise<VerificationResult & { content: string }> {
    const taskContent = await this.generateTaskContent(task);

    const newDoc: Document = {
      id: task.id,
      title: task.title,
      content: taskContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      linkedDocumentIds: [],
      status: "in-progress",
    };

    const savedDoc = await this.documentStore.saveDocument(newDoc);

    this.workflow = {
      ...this.workflow,
      tasks: this.workflow.tasks.map((t) =>
        t.id === task.id
          ? { ...t, documentId: savedDoc.id, status: "in-progress" as const }
          : t,
      ),
    };

    for (const depId of task.dependencies) {
      const depTask = this.workflow.tasks.find((t) => t.id === depId);
      if (depTask?.documentId) {
        await this.documentStore.linkDocuments(depTask.documentId, savedDoc.id);
      }
    }

    const verification = await this.verifyTask(savedDoc, task);

    const newStatus = verification.status === "passed" ? "completed" : "failed";
    savedDoc.status = newStatus as Document["status"];
    await this.documentStore.saveDocument(savedDoc);

    // Return both verification result and the generated content
    return {
      ...verification,
      content: taskContent,
    };
  }

  private async generateTaskContent(task: Task): Promise<string> {
    const systemPrompt = `You are a task execution assistant for Daedalus.
Your role is to generate content for specific tasks in a workflow.

Task: ${task.title}
Description: ${task.description}

Generate concise, focused content that addresses the task requirements.
Keep it structured and actionable.`;

    const userPrompt = `Generate content for this task:

Title: ${task.title}
Description: ${task.description}

Provide a clear, structured response.`;

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const content = await this.llmService.chat(messages);
    return content;
  }

  private async verifyTask(
    document: Document,
    task: Task,
  ): Promise<VerificationResult> {
    const checks = [
      {
        name: "Content Generation",
        passed: document.content.length > 0,
        message:
          document.content.length > 0
            ? "Content generated successfully"
            : "No content generated",
      },
      {
        name: "Task Completion",
        passed: document.content.length > task.title.length,
        message:
          document.content.length > task.title.length
            ? "Content exceeds title length"
            : "Content too brief",
      },
    ];

    const verification: VerificationResult = {
      id: Date.now().toString(),
      documentId: document.id,
      status: checks.every((c) => c.passed) ? "passed" : "failed",
      checks,
      timestamp: new Date().toISOString(),
    };

    this.workflow = {
      ...this.workflow,
      verificationResults: [...this.workflow.verificationResults, verification],
    };

    return verification;
  }

  private async completeWorkflow(): Promise<void> {
    const allCompleted = this.workflow.tasks.every(
      (t) => t.status === "completed",
    );
    if (allCompleted) {
      this.workflow = {
        ...this.workflow,
        state: "completed",
      };
    }
    this.state = "completed";
  }

  getCurrentTaskId(): string | undefined {
    return this.currentTask?.id;
  }
}
