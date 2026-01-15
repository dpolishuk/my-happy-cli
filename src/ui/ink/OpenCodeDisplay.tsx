/**
 * OpenCode Display Component
 *
 * Ink UI component for displaying OpenCode agent output in terminal.
 * Similar structure to GeminiDisplay but adapted for OpenCode.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, Newline } from 'ink';
import type { AgentMessage } from '@/agent/AgentBackend';

export interface OpenCodeDisplayProps {
  messages: AgentMessage[];
  onInput: (input: string) => void;
  onCancel: () => void;
  model: string;
  sessionMode: string;
}

export function OpenCodeDisplay({
  messages,
  onInput,
  onCancel,
  model,
  sessionMode,
}: OpenCodeDisplayProps) {
  const [lastMessageIndex, setLastMessageIndex] = useState(0);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessageIndex(messages.length - 1);
    }
  }, [messages.length]);

  return (
    <Box flexDirection="column">
      {/* Session Info */}
      <Box>
        <Text bold color="cyan">
          OpenCode ({model})
        </Text>
        {sessionMode && (
          <Text color="gray"> · {sessionMode}</Text>
        )}
      </Box>
      <Newline />

      {/* Messages */}
      {messages.map((msg, idx) => (
        <RenderMessage key={idx} message={msg} />
      ))}
    </Box>
  );
}

function RenderMessage({ message }: { message: AgentMessage }) {
  switch (message.type) {
    case 'model-output':
      return (
        <Box>
          <Text>{message.fullText || message.textDelta || ''}</Text>
        </Box>
      );

    case 'tool-call':
      return (
        <Box>
          <Text color="yellow">➜ {message.toolName}</Text>
          <Newline />
          {message.args && (
            <Text color="dim">{JSON.stringify(message.args)}</Text>
          )}
        </Box>
      );

    case 'tool-result':
      return (
        <Box>
          <Text color="green">✓ {message.toolName}</Text>
          <Newline />
          {message.result !== undefined && (
            <Text color="dim">{String(message.result)}</Text>
          )}
        </Box>
      );

    case 'status':
      return (
        <Box>
          <Text color="blue">Status: {message.status}</Text>
          {message.detail && (
            <Text color="gray"> - {message.detail}</Text>
          )}
        </Box>
      );

    default:
      return null;
  }
}
