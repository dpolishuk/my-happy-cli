import { describe, it, expect, beforeEach } from 'vitest';
import { OpenCodeReasoningProcessor } from '@/opencode/utils/reasoningProcessor';

describe('OpenCodeReasoningProcessor', () => {
  let processor: OpenCodeReasoningProcessor;
  let messages: any[] = [];

  beforeEach(() => {
    messages = [];
    processor = new OpenCodeReasoningProcessor((msg) => {
      messages.push(msg);
    });
  });

  it('should accumulate thinking chunks', () => {
    processor.processChunk('Hello');
    processor.processChunk(' World');
    processor.finishReasoning();

    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('tool-call');
    expect(messages[1].type).toBe('reasoning');
  });

  it('should detect title format **Title**', () => {
    processor.processChunk('**Analysis**');
    processor.processChunk('This is analysis');
    processor.finishReasoning();

    expect(messages[0]).toMatchObject({
      type: 'tool-call',
      name: 'CodexReasoning',
      input: { title: 'Analysis' },
    });
  });
});
