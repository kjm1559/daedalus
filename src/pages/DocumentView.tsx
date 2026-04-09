import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DocumentStore } from "@/lib/documentStore";
import { Document } from "@/types/document";
import { DocumentCard } from "@/components/ui/DocumentCard";

export default function DocumentView() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (docId) {
      loadDocument();
    }
  }, [docId]);

  const loadDocument = async () => {
    try {
      const store = new DocumentStore("./workspace");
      const doc = await store.loadDocument(docId);
      setDocument(doc);
    } catch (error) {
      console.error("Failed to load document:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">Document not found</p>
        <button
          onClick={() => navigate("/workspace")}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {document.title}
        </h2>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            document.status === "completed"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : document.status === "verified"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : document.status === "in-progress"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          }`}
        >
          {document.status}
        </span>
      </div>

      <div className="prose dark:prose-invert max-w-none">
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {document.content}
        </pre>
      </div>

      <div className="mt-4 pt-4 border-t dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Updated {new Date(document.updatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
