/**
 * Reasoning Processor for OpenCode - Handles thinking events from ACP
 *
 * This processor accumulates thinking events from OpenCode ACP
 * and identifies when reasoning sections start with **[Title]** format,
 * treating them as tool calls (similar to Codex's ReasoningProcessor).
 *
 * Uses 'CodexReasoning' as tool name for mobile app compatibility.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';

export interface ReasoningToolCall {
  type: 'tool-call';
  name: 'CodexReasoning';
  callId: string;
  input: {
    title: string;
  };
  id: string;
}

export interface ReasoningToolResult {
  type: 'tool-call-result';
  callId: string;
  output: {
    content?: string;
    status?: 'completed' | 'canceled';
  };
  id: string;
}

export interface ReasoningMessage {
  type: 'reasoning';
  message: string;
  id: string;
}

export type ReasoningOutput = ReasoningToolCall | ReasoningToolResult | ReasoningMessage;

export class OpenCodeReasoningProcessor {
  private accumulator: string = '';
  private inTitleCapture: boolean = false;
  private titleBuffer: string = '';
  private contentBuffer: string = '';
  private hasTitle: boolean = false;
  private currentCallId: string | null = null;
  private toolCallStarted: boolean = false;
  private currentTitle: string | null = null;
  private onMessage: ((message: ReasoningOutput) => void) | null = null;

  constructor(onMessage?: (message: ReasoningOutput) => void) {
    this.onMessage = onMessage || null;
    this.reset();
  }

  /**
   * Set message callback for sending messages directly
   */
  setMessageCallback(callback: (message: ReasoningOutput) => void): void {
    this.onMessage = callback;
  }

  /**
   * Process a reasoning section break - indicates a new reasoning section is starting
   */
  handleSectionBreak(): void {
    this.finishCurrentToolCall('canceled');
    this.resetState();
    logger.debug('[OpenCodeReasoningProcessor] Section break - reset state');
  }

  /**
   * Process a reasoning chunk from thinking events
   * OpenCode sends reasoning as chunks via ACP thinking events
   */
  processChunk(chunk: string): void {
    this.accumulator += chunk;

    // If we haven't started processing yet, check if this starts with **
    if (!this.inTitleCapture && !this.hasTitle && !this.contentBuffer) {
      if (this.accumulator.startsWith('**')) {
        // Start title capture
        this.inTitleCapture = true;
        this.titleBuffer = this.accumulator.substring(2); // Remove leading **
        logger.debug('[OpenCodeReasoningProcessor] Started title capture');
      } else if (this.accumulator.length > 0) {
        // This is untitled reasoning, just accumulate as content
        this.contentBuffer = this.accumulator;
      }
    } else if (this.inTitleCapture) {
      // We're capturing title
      this.titleBuffer = this.accumulator.substring(2); // Keep updating from start

      // Check if we've found closing **
      const titleEndIndex = this.titleBuffer.indexOf('**');
      if (titleEndIndex !== -1) {
        // Found end of title
        const title = this.titleBuffer.substring(0, titleEndIndex);
        this.currentTitle = title;
        this.hasTitle = true;

        // Start tool call for this reasoning
        this.startToolCall(title);

        // Switch to content capture
        this.inTitleCapture = false;
        this.contentBuffer = this.titleBuffer.substring(titleEndIndex + 2);
        this.accumulator = this.contentBuffer;

        logger.debug(`[OpenCodeReasoningProcessor] Found title: ${title}`);
      }
    } else {
      // Just accumulate content
      this.contentBuffer = this.accumulator;
    }

    // Emit reasoning message for streaming display
    this.emitReasoningMessage(this.contentBuffer);
  }

  /**
   * Mark reasoning as complete
   */
  finishReasoning(): void {
    if (this.toolCallStarted) {
      this.finishCurrentToolCall('completed');
    }
    this.reset();
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.resetState();
    this.currentCallId = null;
  }

  /**
   * Reset only the capture state, not the call ID
   */
  private resetState(): void {
    this.accumulator = '';
    this.inTitleCapture = false;
    this.titleBuffer = '';
    this.contentBuffer = '';
    this.hasTitle = false;
    this.toolCallStarted = false;
    this.currentTitle = null;
  }

  /**
   * Start a tool call for reasoning section
   */
  private startToolCall(title: string): void {
    if (!this.currentCallId) {
      this.currentCallId = randomUUID();
    }

    const toolCall: ReasoningToolCall = {
      type: 'tool-call',
      name: 'CodexReasoning',
      callId: this.currentCallId,
      input: { title },
      id: randomUUID(),
    };

    this.emit(toolCall);
    this.toolCallStarted = true;

    logger.debug(`[OpenCodeReasoningProcessor] Started reasoning tool call: ${title}`);
  }

  /**
   * Finish current tool call
   */
  private finishCurrentToolCall(status: 'completed' | 'canceled'): void {
    if (!this.currentCallId || !this.toolCallStarted) {
      return;
    }

    const result: ReasoningToolResult = {
      type: 'tool-call-result',
      callId: this.currentCallId,
      output: {
        content: this.contentBuffer,
        status,
      },
      id: randomUUID(),
    };

    this.toolCallStarted = false;
    this.emit(result);

    logger.debug(`[OpenCodeReasoningProcessor] Finished reasoning tool call: ${status}`);
  }

  /**
   * Emit a reasoning message for display
   * Does not emit during active tool calls to avoid duplicate messages
   */
  private emitReasoningMessage(content: string): void {
    if (!this.onMessage) {
      return;
    }

    // Don't emit reasoning messages during active tool calls
    // to avoid duplicate message streams
    if (this.toolCallStarted) {
      return;
    }

    // Don't emit empty messages
    if (!content) {
      return;
    }

    const message: ReasoningMessage = {
      type: 'reasoning',
      message: content,
      id: randomUUID(),
    };

    this.emit(message);
  }

  /**
   * Emit a message to the callback
   * Blocks tool-call and tool-call-result messages during active tool calls
   * to prevent duplicate message streams
   */
  private emit(message: ReasoningOutput): void {
    if (!this.onMessage) {
      return;
    }

    // Block tool-call and tool-call-result during active tool calls
    // to prevent duplicate message streams
    const isToolCall = message.type === 'tool-call' || message.type === 'tool-call-result';
    if (this.toolCallStarted && isToolCall) {
      return;
    }

    this.onMessage(message);
  }
}
