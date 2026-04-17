import { v4 as uuidv4 } from "uuid";
import type {
  ChatEngineConfig,
  ChatMessage,
  ChatSession,
  VerificationRequest,
  VerificationResult,
  ToolCall,
  ChatEngineState,
} from "../types/chat";
import { MessageStore } from "./messageStore";
import { LLMService } from "./llm";
import { DocumentStore } from "./documentStore";
import { WorkflowEngine } from "./workflowEngine";
import type { Task } from "./workflowEngine";

export class ChatEngine {
  private messageStore: MessageStore;
  private llmService: LLMService;
  private documentStore: DocumentStore;
  private workflowEngine: WorkflowEngine;
  private maxSteps: number;
  private verificationTimeout: number;
  private currentSession: ChatSession | null = null;

  constructor(config: ChatEngineConfig) {
    this.messageStore = config.messageStore as MessageStore;
    this.llmService = config.llmService as LLMService;
    this.documentStore = config.documentStore as DocumentStore;
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

    // Execute workflow with streaming
    const result = await this.executeWorkflow(workflow, content);

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

  async *streamProcessMessage(
    content: string,
  ): AsyncGenerator<ChatMessage, void, unknown> {
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

    // Create assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: "",
      status: "streaming",
      timestamp: new Date().toISOString(),
      metadata: {
        workflowId: workflow.id,
        toolCalls: [],
        verificationResult: "approved",
      },
    };

    if (this.currentSession) {
      await this.messageStore.saveMessage(
        this.currentSession.id,
        assistantMessage,
      );
    }

    // Stream workflow execution
    const results: Array<{
      taskTitle: string;
      taskDescription: string;
      status: "completed" | "failed";
      content: string;
    }> = [];

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

        results.push({
          taskTitle: task.title,
          taskDescription: task.description,
          status: taskResult.status === "passed" ? "completed" : "failed",
          content: taskResult.content || "",
        });

        assistantMessage.metadata!.toolCalls!.push(toolCall);

        // Emit partial message with task completion
        yield {
          ...assistantMessage,
          content: `**${task.title}** completed.\n\n${taskResult.content}`,
        };
      } catch (error) {
        toolCall.status = "failed";
        toolCall.result = { error: (error as Error).message };

        results.push({
          taskTitle: task.title,
          taskDescription: task.description,
          status: "failed",
          content: "",
        });

        assistantMessage.metadata!.toolCalls!.push(toolCall);

        yield {
          ...assistantMessage,
          content: `**${task.title}** failed: ${(error as Error).message}`,
        };
      }
    }

    // Generate final summary with streaming
    const systemPrompt = `You are a helpful AI assistant for Daedalus.
Analyze the workflow execution results and provide a clear, natural language summary.

Workflow title: ${workflow.title}
User request: ${content}

Execution Results:
${results
  .map(
    (r) =>
      `- **${r.taskTitle}**: ${r.taskDescription}
  - Status: ${r.status}
  - Generated Content:
    \`\`\`
    ${r.content}
    \`\`\`
`,
  )
  .join("\n")}

Please provide a comprehensive summary of what was accomplished, including:
1. What tasks were executed
2. What content was generated for each task
3. Any insights or next steps`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: content },
    ];

    try {
      // Stream the final summary
      const stream = this.llmService.streamChat(messages);
      let fullSummary = "";

      for await (const chunk of stream) {
        fullSummary += chunk;
        yield {
          ...assistantMessage,
          content: fullSummary,
        };
      }

      assistantMessage.content = fullSummary;
      assistantMessage.status = "complete";

      if (this.currentSession) {
        await this.messageStore.saveMessage(
          this.currentSession.id,
          assistantMessage,
        );
      }

      yield assistantMessage;
    } catch (error) {
      console.error("Failed to generate response:", error);
      const fallbackSummary = `Completed ${workflow.tasks.length} tasks. ${workflow.tasks.length} tools executed.`;

      yield {
        ...assistantMessage,
        content: fallbackSummary,
        status: "complete",
      };

      if (this.currentSession) {
        await this.messageStore.saveMessage(
          this.currentSession.id,
          assistantMessage,
        );
      }
    }
  }

  private async createWorkflowFromMessage(content: string): Promise<Workflow> {
    // Check if this is a simple conversational query
    const isSimpleQuery = this.isSimpleConversationalQuery(content);

    if (isSimpleQuery) {
      // Direct response for simple queries
      const systemPrompt = `You are a helpful AI assistant for Daedalus.
Respond naturally and conversationally to the user's message.

User message: ${content}

Provide a friendly, helpful response that addresses their query directly.`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content },
      ];

      const response = await this.llmService.chat(messages);

      return {
        id: uuidv4(),
        title: "Chat Response",
        state: "planning" as const,
        tasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // For complex requests, create a structured workflow
    const systemPrompt = `You are a workflow planner for Daedalus AI Orchestration System.
Analyze the user's request and create a structured workflow.

User request: ${content}

Output format (JSON):
{
  "title": "Brief description of the task",
  "tasks": [
    {
      "title": "Task name",
      "description": "What needs to be done",
      "dependencies": []
    }
  ]
}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content },
    ];

    try {
      const response = await this.llmService.chat(messages);

      console.log("LLM Workflow Response:", response);

      // Parse response into workflow
      const workflow = this.parseWorkflowResponse(response, content);
      return workflow;
    } catch (error) {
      console.error("LLM Error, using fallback:", error);
      // Fallback: Create a simple workflow from user input
      return {
        id: uuidv4(),
        title: "Chat Response",
        state: "planning" as const,
        tasks: [
          {
            id: uuidv4(),
            title: "Respond to user",
            description: content,
            dependencies: [],
            status: "pending",
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private isSimpleConversationalQuery(content: string): boolean {
    const trimmed = content.trim().toLowerCase();

    // Check for simple greetings and questions
    const simpleGreetings = [
      "hello",
      "hi",
      "hey",
      "greetings",
      "how are you",
      "how's it going",
      "how are things",
      "what's up",
      "what's new",
      "who are you",
      "what is your name",
      "bye",
      "goodbye",
      "see you",
      "thank you",
      "thanks",
      "ty",
      "help",
      "what can you do",
      "what are you capable of",
      "explain",
      "tell me",
    ];

    // Check if the content starts with any simple greeting
    return simpleGreetings.some((greeting) => trimmed.startsWith(greeting));
  }

  private parseWorkflowResponse(
    response: string,
    userContent: string,
  ): Workflow {
    try {
      // Try to extract JSON from response
      let jsonStr = response;

      // If response contains markdown code blocks, extract JSON
      const codeBlockMatch = response.match(/```json\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
        console.log("Extracted JSON from code block:", jsonStr);
      } else {
        // Try to find JSON object in the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr);

      console.log("Parsed workflow JSON:", parsed);

      return {
        id: uuidv4(),
        title: parsed.title || "Generated Workflow",
        state: "planning" as const,
        tasks: (parsed.tasks || []).map((t: any) => ({
          id: uuidv4(),
          title: t.title || "Task",
          description: t.description || "",
          dependencies: t.dependencies || [],
          status: "pending",
          createdAt: new Date().toISOString(),
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.log("Failed to parse JSON response, using fallback:", e);
    }

    // Fallback: Create a simple task from user input
    return {
      id: uuidv4(),
      title: "Chat Response",
      state: "planning" as const,
      tasks: [
        {
          id: uuidv4(),
          title: "Respond to user",
          description: userContent,
          dependencies: [],
          status: "pending",
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private async executeWorkflow(
    workflow: Workflow,
    userContent: string,
  ): Promise<WorkflowResult> {
    // If no tasks, generate a direct response
    if (workflow.tasks.length === 0) {
      const systemPrompt = `You are a helpful AI assistant for Daedalus.
Respond conversationally to the user's message.

User message: ${workflow.title}`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: workflow.title },
      ];

      const response = await this.llmService.chat(messages);

      return {
        summary: response,
        toolCalls: [],
        verificationResult: "approved",
      };
    }

    // Execute workflow steps
    const result: WorkflowResult = {
      summary: "",
      toolCalls: [],
      verificationResult: "approved",
    };

    // Collect task execution results
    const executionResults: Array<{
      taskTitle: string;
      taskDescription: string;
      status: "completed" | "failed";
      content: string;
    }> = [];

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

        executionResults.push({
          taskTitle: task.title,
          taskDescription: task.description,
          status: taskResult.status === "passed" ? "completed" : "failed",
          content: taskResult.content || "",
        });
      } catch (error) {
        toolCall.status = "failed";
        toolCall.result = { error: (error as Error).message };

        executionResults.push({
          taskTitle: task.title,
          taskDescription: task.description,
          status: "failed",
          content: "",
        });
      }

      result.toolCalls.push(toolCall);
    }

    // Generate a conversational response based on the workflow execution
    const systemPrompt = `You are a helpful AI assistant for Daedalus.
Analyze the workflow execution results and provide a clear, natural language summary.

Workflow title: ${workflow.title}
User request: ${userContent}

Execution Results:
${executionResults
  .map(
    (r) =>
      `- **${r.taskTitle}**: ${r.taskDescription}
  - Status: ${r.status}
  - Generated Content:
    \`\`\`
    ${r.content}
    \`\`\`
`,
  )
  .join("\n")}

Please provide a comprehensive summary of what was accomplished, including:
1. What tasks were executed
2. What content was generated for each task
3. Any insights or next steps`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userContent },
    ];

    try {
      const response = await this.llmService.chat(messages);
      result.summary = response;
    } catch (error) {
      console.error("Failed to generate response:", error);
      result.summary = `Completed ${workflow.tasks.length} tasks. ${workflow.tasks.length} tools executed.`;
    }

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

export interface WorkflowResult {
  summary: string;
  toolCalls: ToolCall[];
  verificationResult: VerificationResult;
}

export interface Workflow {
  id: string;
  title: string;
  state: "planning" | "executing" | "completed" | "failed";
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}
