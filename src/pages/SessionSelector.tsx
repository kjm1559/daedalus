import { useState, useEffect } from "react";
import { DocumentStore } from "@/lib/documentStore";
import { LLMService } from "@/lib/llm";
import { WorkflowEngine } from "@/lib/workflowEngine";
import { SessionManager, Session } from "@/lib/sessionManager";
import { Document } from "@/types/document";
import { Workflow } from "@/lib/workflow";
import { DocumentCard } from "@/components/ui/DocumentCard";
import { DocumentTree } from "@/components/ui/DocumentTree";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function SessionSelector() {
  const navigate = useNavigate();
  const [documentStore] = useState<DocumentStore>(
    new DocumentStore("./workspace"),
  );
  const [llmService] = useState<LLMService>(LLMService.fromEnv());
  const [sessionManager] = useState<SessionManager>(
    new SessionManager(documentStore, llmService),
  );
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("");

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const loadedSessions = await sessionManager.getSessions();
      setSessions(loadedSessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
      toast.error("Failed to load sessions");
    }
  };

  const handleCreateNewSession = async () => {
    if (!newSessionTitle.trim()) {
      toast.error("Please enter a session title");
      return;
    }

    try {
      const session = await sessionManager.startNewSession(newSessionTitle);
      setSessions((prev) => [session, ...prev]);
      navigate(`/session/${session.id}`);
    } catch (error) {
      toast.error("Failed to create session");
    }
  };

  const handleContinueSession = async (sessionId: string) => {
    try {
      const session = await sessionManager.continueSession(sessionId);
      if (session) {
        navigate(`/session/${sessionId}`);
      }
    } catch (error) {
      toast.error("Failed to load session");
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const deleted = await sessionManager.deleteSession(sessionId);
      if (deleted) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (selectedSessionId === sessionId) {
          setSelectedSessionId(null);
        }
        toast.success("Session deleted");
      }
    } catch (error) {
      toast.error("Failed to delete session");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Daedalus - Session Manager
        </h1>

        <div className="mb-6">
          <button
            onClick={() => setShowNewSession(!showNewSession)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {showNewSession ? "Cancel" : "New Session"}
          </button>
        </div>

        {showNewSession && (
          <div className="mb-6 space-y-4">
            <input
              type="text"
              value={newSessionTitle}
              onChange={(e) => setNewSessionTitle(e.target.value)}
              placeholder="Enter session title"
              className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateNewSession();
                }
              }}
            />
            <button
              onClick={handleCreateNewSession}
              disabled={!newSessionTitle.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Session
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Sessions
          </h2>

          {sessions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No sessions yet. Create a new session to get started.
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 transition-colors bg-white dark:bg-gray-800"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {session.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(session.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleContinueSession(session.id)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
