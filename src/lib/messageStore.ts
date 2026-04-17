import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { ChatSession, ChatMessage } from "@/types/chat";

export class MessageStore {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  async initialize(): Promise<void> {
    const messagesPath = path.join(this.workspacePath, "messages");
    try {
      await fs.access(messagesPath);
    } catch {
      await fs.mkdir(messagesPath, { recursive: true });
    }
  }

  private getFilePath(sessionId: string): string {
    return path.join(this.workspacePath, "messages", `${sessionId}.json`);
  }

  async saveMessage(sessionId: string, message: ChatMessage): Promise<void> {
    await this.initialize();

    const filePath = this.getFilePath(sessionId);
    try {
      const existingData = await fs.readFile(filePath, "utf-8");
      const session: ChatSession = JSON.parse(existingData) as ChatSession;
      session.messages.push(message);
      session.updatedAt = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    } catch {
      const newSession: ChatSession = {
        id: sessionId,
        title: `Chat Session ${sessionId.slice(0, 8)}`,
        messages: [message],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(filePath, JSON.stringify(newSession, null, 2));
    }
  }

  async loadSession(sessionId: string): Promise<ChatSession | null> {
    const filePath = this.getFilePath(sessionId);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as ChatSession;
    } catch {
      return null;
    }
  }

  async listSessions(): Promise<ChatSession[]> {
    await this.initialize();

    const messagesPath = path.join(this.workspacePath, "messages");
    try {
      const files = await fs.readdir(messagesPath);
      const sessions: ChatSession[] = [];

      for (const file of files) {
        if (file.endsWith(".json")) {
          const sessionId = file.replace(".json", "");
          const session = await this.loadSession(sessionId);
          if (session) {
            sessions.push(session);
          }
        }
      }

      return sessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } catch {
      return [];
    }
  }

  async findMessagesByTask(taskId: string): Promise<ChatMessage[]> {
    const sessions = await this.listSessions();
    const foundMessages: ChatMessage[] = [];

    for (const session of sessions) {
      const matchingMessages = session.messages.filter(
        (msg) => msg.metadata?.taskId === taskId,
      );
      foundMessages.push(...matchingMessages);
    }

    return foundMessages;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const filePath = this.getFilePath(sessionId);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createSession(title: string): Promise<ChatSession> {
    await this.initialize();

    const sessionId = uuidv4();
    const session: ChatSession = {
      id: sessionId,
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const filePath = this.getFilePath(sessionId);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));

    return session;
  }
}
