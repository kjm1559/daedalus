import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DocumentStore, documentStore } from "@/lib/documentStore";
import { LLMService } from "@/lib/llm";
import { WorkflowEngine } from "@/lib/workflowEngine";
import type { Task } from "@/lib/workflowEngine";
import { Document } from "@/types/document";
import { Workflow } from "@/lib/workflow";
import { DocumentCard } from "@/components/ui/DocumentCard";
import { DocumentTree } from "@/components/ui/DocumentTree";
import { toast } from "sonner";

interface DocumentWithContent extends Document {
  fullContent?: string;
}

export default function Home() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentWithContent[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ role: string; content: string }>
  >([]);

  const [documentStore] = useState<DocumentStore>(
    new DocumentStore("./workspace"),
  );
  const [llmService] = useState<LLMService>(LLMService.fromEnv());
  const [workflowEngine, setWorkflowEngine] = useState<WorkflowEngine | null>(
    null,
  );

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const docs = await documentStore.listDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error("Failed to load documents:", error);
      toast.error("Failed to load documents");
    }
  };

  const handleSendMessage = async () => {
    if (isProcessing) return;

    const userInput = prompt("Enter task description:");
    if (!userInput) return;

    setIsProcessing(true);
    setMessages((prev) => [...prev, { role: "user", content: userInput }]);

    try {
      const tasks = parseTaskOutline(userInput);

      const newWorkflowEngine = new WorkflowEngine({
        documentStore,
        llmService,
        maxSteps: 50,
        verificationTimeout: 300000,
      });

      for (const task of tasks) {
        const newTask = newWorkflowEngine
          .getWorkflow()
          .tasks.find((t) => t.title === task.title);
        if (!newTask) {
          const taskToAdd = {
            title: task.title,
            description: task.description,
            dependencies: task.dependencies,
          };
          newWorkflowEngine
            .getWorkflow()
            .tasks.push(taskToAdd as unknown as Task);
        }
      }

      newWorkflowEngine.start();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Created workflow with ${tasks.length} tasks. Execution started.`,
        },
      ]);
      setWorkflowEngine(newWorkflowEngine);
      loadDocuments();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${(error as Error).message}` },
      ]);
      toast.error("Failed to create workflow");
    }

    setIsProcessing(false);
  };

  const parseTaskOutline = (
    task: string,
  ): Array<{
    id: string;
    title: string;
    description: string;
    dependencies: string[];
  }> => {
    const lines = task.split("\n").filter((line) => line.trim());
    const tasks: Array<{
      id: string;
      title: string;
      description: string;
      dependencies: string[];
    }> = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        const title = trimmed.substring(1).trim();
        tasks.push({
          id: `task-${index}`,
          title: title,
          description: `Complete ${title}`,
          dependencies: index > 0 ? [`task-${index - 1}`] : [],
        });
      } else if (trimmed.length > 0) {
        tasks.push({
          id: `task-${index}`,
          title: trimmed,
          description: `Complete ${trimmed}`,
          dependencies: index > 0 ? [`task-${index - 1}`] : [],
        });
      }
    });

    return tasks;
  };

  const selectedDocument = documents.find((d) => d.id === selectedDocId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Documents
          </h2>
          <DocumentTree
            documents={documents}
            selectedDocumentId={selectedDocId}
            onSelect={setSelectedDocId}
          />
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Workflow Assistant
          </h2>

          <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSendMessage}
            disabled={isProcessing}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {isProcessing ? "Processing..." : "Start New Workflow"}
          </button>
        </div>

        {selectedDocument && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {selectedDocument.title}
              </h2>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  selectedDocument.status === "completed"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : selectedDocument.status === "verified"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : selectedDocument.status === "in-progress"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {selectedDocument.status}
              </span>
            </div>

            <div className="prose dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {selectedDocument.content}
              </pre>
            </div>

            <div className="mt-4 pt-4 border-t dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Updated {new Date(selectedDocument.updatedAt).toLocaleString()}
              </p>
              {selectedDocument.linkedDocumentIds.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Linked Documents:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedDocument.linkedDocumentIds.map((linkId) => {
                      const linkedDoc = documents.find((d) => d.id === linkId);
                      return linkedDoc ? (
                        <button
                          key={linkId}
                          onClick={() => setSelectedDocId(linkId)}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {linkedDoc.title}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!selectedDocument && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Select a document to view details, or start a new workflow to
              create documents.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
