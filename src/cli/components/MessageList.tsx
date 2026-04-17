import { Box, Text } from "ink";
import { ChatMessage } from "@/types/chat";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((msg) => (
        <Box key={msg.id} marginBottom={1}>
          <Text bold color={msg.role === "user" ? "green" : "cyan"}>
            {msg.role === "user" ? "You" : "Agent"}:
          </Text>
          <Box flexDirection="column" marginLeft={1}>
            <Text>{msg.content}</Text>
            {msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0 && (
              <Box marginLeft={1}>
                {msg.metadata.toolCalls.map((tc) => (
                  <Box key={tc.id} marginBottom={1}>
                    <Text
                      color={
                        tc.status === "executing"
                          ? "yellow"
                          : tc.status === "complete"
                            ? "green"
                            : tc.status === "failed"
                              ? "red"
                              : "gray"
                      }
                    >
                      [{tc.status}] {tc.name}
                    </Text>
                    {tc.result &&
                    typeof tc.result === "object" &&
                    tc.result !== null ? (
                      <Text color="gray">
                        {JSON.stringify(tc.result, null, 2)}
                      </Text>
                    ) : null}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
