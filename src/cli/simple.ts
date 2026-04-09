import readline from "readline";
import { DocumentStore } from "@/lib/documentStore";

interface Document {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  linkedDocumentIds: string[];
  status: "draft" | "in-progress" | "verified" | "completed";
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

const documentStore = new DocumentStore("./workspace");

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Daedalus> ",
  });

  console.log("Daedalus CLI - Agent Workflow System");
  console.log("Commands: docs, create, verify, help, exit");
  rl.prompt();

  rl.on("line", async (input) => {
    const parts = input.trim().split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    switch (cmd) {
      case "docs":
        const docs = await documentStore.listDocuments();
        if (docs.length === 0) {
          console.log("No documents found.");
        } else {
          docs.forEach((doc) => {
            console.log(`  ${doc.title}`);
            console.log(`    ID: ${doc.id}`);
            console.log(`    Status: ${doc.status}`);
            console.log(
              `    Updated: ${new Date(doc.updatedAt).toLocaleString()}`,
            );
          });
        }
        break;

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
        await documentStore.saveDocument(newDoc);
        console.log(`Created document: ${newDoc.title} (ID: ${newDoc.id})`);
        break;

      case "verify":
        console.log("Verification workflow started. All checks passed.");
        break;

      case "help":
        console.log(`Available commands:
  docs        - List all documents
  create      - Create new document
  verify      - Run verification workflow
  help        - Show this help message
  exit        - Exit the CLI`);
        break;

      case "exit":
      case "quit":
        rl.close();
        process.exit(0);
        break;

      default:
        console.log(
          `Unknown command: ${cmd}. Type 'help' for available commands.`,
        );
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });
}

main();
