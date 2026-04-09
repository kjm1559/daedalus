import { create } from "zustand";
import { ChatMessage, ChatSession, VerificationRequest } from "@/types/chat";

interface ChatState {
  currentSession: ChatSession | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingVerification: VerificationRequest | null;

  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setSession: (session: ChatSession | null) => void;
  setPendingVerification: (request: VerificationRequest | null) => void;
  clearSession: () => void;
  setIsStreaming: (isStreaming: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  currentSession: null,
  messages: [],
  isStreaming: false,
  pendingVerification: null,

  addMessage: (message: ChatMessage) => {
    set((state) => ({
      messages: [...state.messages, message],
      currentSession: state.currentSession
        ? {
            ...state.currentSession,
            messages: [...state.currentSession.messages, message],
            updatedAt: new Date().toISOString(),
          }
        : null,
    }));
  },

  updateMessage: (id: string, updates: Partial<ChatMessage>) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg,
      ),
      currentSession: state.currentSession
        ? {
            ...state.currentSession,
            messages: state.currentSession.messages.map((msg) =>
              msg.id === id ? { ...msg, ...updates } : msg,
            ),
          }
        : null,
    }));
  },

  setSession: (session: ChatSession | null) => {
    set({
      currentSession: session,
      messages: session?.messages || [],
    });
  },

  setPendingVerification: (request: VerificationRequest | null) => {
    set({ pendingVerification: request });
  },

  clearSession: () => {
    set({
      currentSession: null,
      messages: [],
      pendingVerification: null,
    });
  },

  setIsStreaming: (isStreaming: boolean) => {
    set({ isStreaming });
  },
}));
