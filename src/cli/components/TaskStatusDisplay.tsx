import { Box, Text } from "ink";
import { TaskStatus } from "@/types/chat";

interface TaskStatusProps {
  status: TaskStatus;
}

export function TaskStatusDisplay({ status }: TaskStatusProps) {
  const statusColor =
    status.status === "executing"
      ? "yellow"
      : status.status === "completed"
        ? "green"
        : status.status === "failed"
          ? "red"
          : "gray";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={statusColor}>
        Task: {status.status.toUpperCase()}
      </Text>
      <Text color="gray">Progress: {status.progress}%</Text>
    </Box>
  );
}
