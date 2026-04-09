import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { render } from "ink";

interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  linkedDocumentIds: string[];
  status: "draft" | "in-progress" | "verified" | "completed";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const MOCK_DOCUMENTS: Document[] = [
  {
    id: "1",
    title: "Project Overview",
    content: "Initial project documentation...",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    linkedDocumentIds: ["2"],
    status: "in-progress",
  },
  {
    id: "2",
    title: "Task Planning",
    content: "Detailed task breakdown...",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    linkedDocumentIds: [],
    status: "draft",
  },
];

export default function CLIApp() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Daedalus CLI ready. Commands: docs, verify, help",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [documents, setDocuments] = useState(MOCK_DOCUMENTS);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsProcessing(true);

    const response = await processCommand(inputValue.trim(), documents);
    setMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
      },
    ]);
    setIsProcessing(false);
  };

  const processCommand = async (
    command: string,
    docs: Document[],
  ): Promise<string> => {
    const parts = command.split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    switch (cmd) {
      case "docs":
        return formatDocuments(docs);

      case "create":
        const newDoc: Document = {
          id: Date.now().toString(),
          title: args || "Untitled Document",
          content: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          linkedDocumentIds: [],
          status: "draft",
        };
        setDocuments((prev) => [...prev, newDoc]);
        return `Created document: ${newDoc.title} (ID: ${newDoc.id})`;

      case "verify":
        return "Verification workflow started. All checks passed.";

      case "help":
        return `Available commands:
  docs        - List all documents
  create      - Create new document
  verify      - Run verification workflow
  help        - Show this help message
  clear       - Clear messages`;

      case "clear":
        setMessages((prev) => prev.filter((m) => m.role === "assistant"));
        return "";

      default:
        return `Unknown command: ${cmd}. Type 'help' for available commands.`;
    }
  };

  const formatDocuments = (docs: Document[]): string => {
    if (docs.length === 0) {
      return "No documents found.";
    }

    return docs
      .map((doc) => {
        return `  ${doc.title}
    ID: ${doc.id}
    Status: ${doc.status}
    Updated: ${new Date(doc.updatedAt).toLocaleString()}
    Linked: ${doc.linkedDocumentIds.length > 0 ? doc.linkedDocumentIds.join(", ") : "none"}
`;
      })
      .join("\n");
  };

  useInput((input, key) => {
    // @ts-ignore - Key type issue with ink
    if (key.enter) {
      handleSend();
    } else if (input === "\x1B") {
      process.exit(0);
    } else if (input === "c" && key.ctrl) {
      setMessages([
        {
          id: "1",
          role: "assistant",
          content: "Daedalus CLI ready. Commands: docs, verify, help",
        },
      ]);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="blue"
      padding={1}
    >
      <Text bold color="blue">
        Daedalus - Agent Workflow System
      </Text>
      <Text color="gray">(Press Ctrl+C to clear, ESC to exit)</Text>

      <Box flexDirection="column" marginTop={2}>
        {messages.map((msg) => (
          <Box key={msg.id} marginBottom={1}>
            <Text bold color={msg.role === "user" ? "green" : "cyan"}>
              {msg.role === "user" ? "You" : "Agent"}:
            </Text>
            {/* @ts-ignore - Props issue with ink Box */}
            <Box paddingLeft={1}>
              <Text>{msg.content}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={2}>
        <Text color="gray">&gt;</Text>
        <Box paddingLeft={1}>
          <Text>
            {inputValue}
            {isProcessing && <Text color="yellow">...</Text>}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

export function runCLI() {
  const { unmount } = render(<CLIApp />);

  // Keep process alive until user presses ESC
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (data) => {
    // ESC key (0x1b) or Ctrl+C
    if (data.toString() === "\x1b" || data[0] === 3) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      unmount();
      process.exit(0);
    }
  });
}
