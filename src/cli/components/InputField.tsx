import { Box, Text, useInput } from "ink";
import { useState } from "react";

interface InputFieldProps {
  onSubmit: (input: string) => void;
  isStreaming: boolean;
  placeholder?: string;
}

export function InputField({
  onSubmit,
  isStreaming,
  placeholder = "Type your message...",
}: InputFieldProps) {
  const [input, setInput] = useState("");

  useInput((inputValue, key) => {
    if (key.return && !isStreaming) {
      if (inputValue.trim()) {
        onSubmit(inputValue.trim());
        setInput("");
      }
    } else if (key.escape) {
      process.exit(0);
    }
  });

  return (
    <Box flexDirection="column" marginTop={2}>
      <Text color="gray">&gt;</Text>
      <Box paddingLeft={1}>
        <Text>{input || placeholder}</Text>
        {isStreaming && <Text color="yellow">...</Text>}
      </Box>
    </Box>
  );
}
