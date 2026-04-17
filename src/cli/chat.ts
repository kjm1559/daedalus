import readline from "readline";
import { v4 as uuidv4 } from "uuid";
import { ChatEngine } from "@/lib/chatEngine";
import { MessageStore } from "@/lib/messageStore";
import { LLMService } from "@/lib/llm";
import { DocumentStore } from "@/lib/documentStore";
import "dotenv/config";

async function main() {
  const documentStore = new DocumentStore("./workspace");
  const messageStore = new MessageStore("./workspace/messages");
  const llmService = LLMService.fromEnv();

  const chatEngine = new ChatEngine({
    documentStore,
    messageStore,
    llmService,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Daedalus Chat> ",
  });

  console.log("Daedalus Chat - AI Task Orchestration System");
  console.log("Commands: help, new, sessions, exit");
  console.log("Type your message to start a task...\n");
  rl.prompt();

  let currentSession: string | null = null;

  if (currentSession) {
    const session = await chatEngine.loadSession(currentSession);
    if (session) {
      console.log(`\nResumed session: ${session.title} (ID: ${session.id})\n`);
    } else {
      const sessionTitle = `Session ${uuidv4().slice(0, 8)}`;
      const newSession = await chatEngine.createSession(sessionTitle);
      currentSession = newSession.id;
      console.log(
        `\nAuto-created session: ${newSession.title} (ID: ${newSession.id})\n`,
      );
    }
  } else {
    const sessionTitle = `Session ${uuidv4().slice(0, 8)}`;
    const session = await chatEngine.createSession(sessionTitle);
    currentSession = session.id;
    console.log(
      `\nAuto-created session: ${session.title} (ID: ${session.id})\n`,
    );
  }

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    const parts = trimmed.split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    switch (cmd) {
      case "help":
        console.log(`Available commands:
  help        - Show this help message
  new         - Create new chat session
  sessions    - List available sessions
  exit        - Exit the CLI

Type your message to start a task. The AI will analyze your request,
create a workflow, execute tasks, and provide results with verification.`);
        break;

      case "new":
        const sessionTitle = args || `Session ${uuidv4().slice(0, 8)}`;
        const session = await chatEngine.createSession(sessionTitle);
        currentSession = session.id;
        console.log(`Created session: ${session.title} (ID: ${session.id})`);
        break;

      case "sessions":
        const sessions = await messageStore.listSessions();
        if (sessions.length === 0) {
          console.log("No sessions found. Use 'new' to create one.");
        } else {
          console.log(`Available sessions (${sessions.length}):`);
          sessions.forEach((s) => {
            console.log(`  - ${s.title} (ID: ${s.id})`);
          });
        }
        break;

      case "exit":
      case "quit":
        rl.close();
        process.exit(0);
        break;

      default:
        if (!currentSession) {
          console.log(
            "No active session. Use 'new' to create a session first.",
          );
          rl.prompt();
          return;
        }

        // User message
        console.log(`\nYou: ${trimmed}\n`);

        // Process message with streaming
        console.log("Agent: ");
        const messageStream = chatEngine.streamProcessMessage(trimmed);

        let fullContent = "";
        for await (const message of messageStream) {
          if (message.status === "streaming") {
            // Clear current line and print updated content
            process.stdout.write("\r\x1b[K"); // Clear line
            process.stdout.write(`Agent: ${message.content}`);
            fullContent = message.content;
          }
        }

        console.log(); // New line after streaming complete
        console.log();

        if (fullContent) {
          const response: any = {
            content: fullContent,
            metadata: {
              toolCalls: [],
            },
          };

          // Reconstruct metadata from the last message
          if (messageStream[Symbol.asyncIterator]) {
            // Tool calls info would be available here
          }
        }
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });
}

main();
