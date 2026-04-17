import { DocumentStore } from "@/lib/documentStore";
import { LLMService } from "@/lib/llm";
import { Workflow } from "@/lib/workflow";

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workflow?: Workflow;
}

export class SessionManager {
  private sessions: Session[] = [];
  private currentSessionId: string | null = null;

  constructor(
    private documentStore: DocumentStore,
    private llmService: LLMService,
  ) {}

  async createSession(title: string): Promise<Session> {
    const session: Session = {
      id: Date.now().toString(),
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sessions.push(session);
    this.currentSessionId = session.id;

    return session;
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      this.currentSessionId = sessionId;
      return session;
    }

    try {
      const doc = await this.documentStore.loadDocument(sessionId);
      if (doc) {
        const workflow: Workflow = {
          id: doc.id,
          title: doc.title,
          state: doc.status as any,
          tasks: [],
          documents: [],
          verificationResults: [],
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };

        const loadedSession: Session = {
          id: sessionId,
          title: doc.title,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          workflow,
        };

        this.sessions.push(loadedSession);
        this.currentSessionId = sessionId;
        return loadedSession;
      }
    } catch {
      // Ignore errors
    }

    return null;
  }

  getCurrentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.sessions.find((s) => s.id === this.currentSessionId) || null;
  }

  async startNewSession(title: string): Promise<Session> {
    return this.createSession(title);
  }

  async continueSession(sessionId: string): Promise<Session | null> {
    return this.loadSession(sessionId);
  }

  getSessions(): Session[] {
    return this.sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    if (index !== -1) {
      this.sessions.splice(index, 1);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      return true;
    }
    return false;
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.title = title;
      session.updatedAt = new Date().toISOString();
    }
  }
}
