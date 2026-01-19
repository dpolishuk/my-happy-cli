# OpenCode ACP Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full OpenCode ACP support in Happy CLI with complete agent client protocol integration, mobile app connectivity, and all protocol features.

**Architecture:** Adapted from Gemini implementation with OpenCode-specific adaptations. Reuses existing `AcpSdkBackend` for ACP protocol, creates new `src/opencode/` module following established patterns, implements processors for reasoning, diffs, permissions, and integrates with Happy server for mobile app messaging.

**Tech Stack:** TypeScript, ink (UI), Vitest (testing), @agentclientprotocol/sdk (ACP protocol), OpenCode CLI (external dependency)

---

## Task 1: Create OpenCode Types

**Files:**
- Create: `src/opencode/types.ts`

**Step 1: Write types file**

```typescript
/**
 * OpenCode Types
 *
 * Centralized type definitions for OpenCode integration.
 */

/**
 * Permission mode for tool approval
 */
export type PermissionMode = 'default' | 'read-only' | 'safe-yolo' | 'yolo';

/**
 * Mode configuration for OpenCode messages
 */
export interface OpenCodeMode {
  permissionMode: PermissionMode;
  model?: string;
  originalUserMessage?: string;
}

/**
 * OpenCode message payload for sending messages to mobile app
 * Reuses Codex format for consistency with existing mobile app
 */
export interface OpenCodeMessagePayload {
  type: 'message';
  message: string;
  id: string;
  options?: string[];
}

/**
 * OpenCode-specific session metadata
 */
export interface OpenCodeSessionMetadata {
  opencodeSessionId: string;
  directory: string;
  startedAt: number;
  model: string;
}

/**
 * ACP session mode states supported by OpenCode
 */
export type AcpSessionMode = 'ask' | 'architect' | 'code';
```

**Step 2: Run typecheck to verify types compile**

Run: `npm run typecheck`
Expected: PASS (no TypeScript errors)

**Step 3: Commit**

```bash
git add src/opencode/types.ts
git commit -m "feat(opencode): add core type definitions"
```

---

## Task 2: Create OpenCode Backend Factory

**Files:**
- Create: `src/agent/acp/opencode.ts`
- Modify: `src/agent/acp/index.ts:11`
- Modify: `src/agent/index.ts:35-39`

**Step 1: Write failing test for backend creation**

Create: `src/opencode/__tests__/unit/acp/opencode.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createOpenCodeBackend } from '@/agent/acp/opencode';

describe('OpenCode Backend', () => {
  it('should create backend with correct command', () => {
    const backend = createOpenCodeBackend({
      cwd: '/test/dir',
      model: 'claude-sonnet-4',
    });

    // Verify backend was created
    expect(backend).toBeDefined();
  });

  it('should support permission handler', () => {
    const mockPermissionHandler = {
      handleToolCall: vi.fn(),
    };

    const backend = createOpenCodeBackend({
      cwd: '/test/dir',
      permissionHandler: mockPermissionHandler,
    });

    expect(backend).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/opencode/__tests__/unit/acp/opencode.test.ts`
Expected: FAIL with "Cannot find module '@/agent/acp/opencode'"

**Step 3: Implement OpenCode backend factory**

Create: `src/agent/acp/opencode.ts`

```typescript
/**
 * OpenCode ACP Backend - OpenCode agent via ACP
 *
 * This module provides a factory function for creating an OpenCode backend
 * that communicates using the Agent Client Protocol (ACP).
 *
 * OpenCode supports ACP natively via the `opencode acp` command.
 */

import { AcpSdkBackend, type AcpSdkBackendOptions, type AcpPermissionHandler } from './AcpSdkBackend';
import type { AgentBackend, McpServerConfig } from '../AgentBackend';
import { agentRegistry, type AgentFactoryOptions } from '../AgentRegistry';
import { logger } from '@/ui/logger';

/**
 * Options for creating an OpenCode ACP backend
 */
export interface OpenCodeBackendOptions extends AgentFactoryOptions {
  /** Model to use (written to config.json before spawning) */
  model?: string;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Optional permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;

  /** Optional session ID to resume an existing session */
  resumeSessionId?: string;

  /** Session mode for this Happy session */
  sessionMode?: 'default' | 'yolo' | 'safe';
}

/**
 * Create an OpenCode backend using ACP.
 *
 * OpenCode must be installed and available in PATH.
 * Uses the `opencode acp` command to enable ACP mode.
 *
 * Note: Model is set via ~/.config/opencode/config.json, not via command line.
 * The `opencode acp` command does not support --model flag.
 *
 * @param options - Configuration options
 * @returns AgentBackend instance for OpenCode
 */
export function createOpenCodeBackend(options: OpenCodeBackendOptions): AgentBackend {
  const command = 'opencode';
  const args = ['acp'];

  // Note: We don't pass --model flag because `opencode acp` doesn't support it.
  // Model should be set via ~/.config/opencode/config.json before spawning.
  // The model option is kept for API compatibility but handling is done by the caller.

  const backendOptions: AcpSdkBackendOptions = {
    agentName: 'opencode',
    cwd: options.cwd,
    command,
    args,
    env: options.env,
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
    resumeSessionId: options.resumeSessionId,
    sessionMode: options.sessionMode,
  };

  logger.debug('[OpenCode] Creating ACP SDK backend with options:', {
    cwd: backendOptions.cwd,
    command: backendOptions.command,
    args: backendOptions.args,
    model: options.model,
    mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0,
  });

  return new AcpSdkBackend(backendOptions);
}

/**
 * Register OpenCode backend with the global agent registry.
 *
 * This function should be called during application initialization
 * to make the OpenCode agent available for use.
 */
export function registerOpenCodeAgent(): void {
  agentRegistry.register('opencode', (opts) => createOpenCodeBackend(opts));
  logger.debug('[OpenCode] Registered with agent registry');
}
```

**Step 4: Export from ACP module**

Modify: `src/agent/acp/index.ts`

After line 11, add:

```typescript
export { createOpenCodeBackend, registerOpenCodeAgent, type OpenCodeBackendOptions } from './opencode';
```

**Step 5: Register agent initialization**

Modify: `src/agent/index.ts`

After line 37, add:

```typescript
const { registerOpenCodeAgent } = require('./acp/opencode');
registerOpenCodeAgent();
```

**Step 6: Run tests to verify they pass**

Run: `npm test -- src/opencode/__tests__/unit/acp/opencode.test.ts`
Expected: PASS

**Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add src/agent/acp/opencode.ts src/agent/acp/index.ts src/agent/index.ts src/opencode/__tests__/unit/acp/opencode.test.ts
git commit -m "feat(opencode): add ACP backend factory and registration"
```

---

## Task 3: Implement Permission Handler

**Files:**
- Create: `src/opencode/utils/permissionHandler.ts`
- Create: `src/opencode/__tests__/unit/utils/permissionHandler.test.ts`

**Step 1: Write failing test for permission mapping**

Create: `src/opencode/__tests__/unit/utils/permissionHandler.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodePermissionHandler } from '@/opencode/utils/permissionHandler';
import type { PermissionMode } from '@/opencode/types';

describe('OpenCodePermissionHandler', () => {
  let handler: OpenCodePermissionHandler;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      sendPermissionRequest: vi.fn(),
    };
    handler = new OpenCodePermissionHandler(mockApiClient);
  });

  it('should map default mode to allow_once', async () => {
    const decision = await handler.handleToolCall('call-1', 'read-file', {});
    expect(decision.decision).toBe('approved_for_session');
  });

  it('should map yolo mode to allow_always', async () => {
    handler.setPermissionMode('yolo');
    const decision = await handler.handleToolCall('call-1', 'read-file', {});
    expect(decision.decision).toBe('approved');
  });

  it('should map read-only mode to reject for write operations', async () => {
    handler.setPermissionMode('read-only');
    const decision = await handler.handleToolCall('call-1', 'write-file', {});
    expect(decision.decision).toBe('denied');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/opencode/__tests__/unit/utils/permissionHandler.test.ts`
Expected: FAIL with "Cannot find module '@/opencode/utils/permissionHandler'"

**Step 3: Implement permission handler**

Create: `src/opencode/utils/permissionHandler.ts`

```typescript
/**
 * OpenCode Permission Handler
 *
 * Handles tool permission requests from OpenCode ACP backend,
 * integrating with Happy server for mobile app approval flow.
 */

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import type { PermissionMode } from '../types';
import type { AcpPermissionHandler } from '../../agent/acp/AcpSdkBackend';

/**
 * Read-only tool types that should be allowed in read-only mode
 */
const READ_ONLY_TOOLS = new Set([
  'read-file',
  'search-files',
  'list-files',
]);

/**
 * Write-only tool types that should be rejected in read-only mode
 */
const WRITE_TOOLS = new Set([
  'write-file',
  'delete-file',
  'create-file',
]);

export class OpenCodePermissionHandler implements AcpPermissionHandler {
  private permissionMode: PermissionMode = 'default';
  private pendingRequests = new Map<string, (decision: any) => void>();

  constructor(private apiClient: ApiClient) {
  }

  /**
   * Set the current permission mode
   */
  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    logger.debug(`[OpenCodePermissionHandler] Permission mode set to: ${mode}`);
  }

  /**
   * Handle a tool call permission request
   */
  async handleToolCall(
    toolCallId: string,
    toolName: string,
    input: unknown
  ): Promise<{ decision: 'approved' | 'approved_for_session' | 'denied' | 'abort' }> {
    logger.debug(`[OpenCodePermissionHandler] Permission request: ${toolName} (${toolCallId})`);

    // YOLO mode: auto-approve everything
    if (this.permissionMode === 'yolo' || this.permissionMode === 'safe-yolo') {
      logger.debug(`[OpenCodePermissionHandler] YOLO mode - auto-approving ${toolName}`);
      return { decision: 'approved' };
    }

    // Read-only mode: reject write operations
    if (this.permissionMode === 'read-only' && WRITE_TOOLS.has(toolName)) {
      logger.debug(`[OpenCodePermissionHandler] Read-only mode - rejecting ${toolName}`);
      return { decision: 'denied' };
    }

    // Default mode: ask via mobile app
    return this.requestPermissionViaMobile(toolCallId, toolName, input);
  }

  /**
   * Send permission request to mobile app via Happy server
   */
  private async requestPermissionViaMobile(
    toolCallId: string,
    toolName: string,
    input: unknown
  ): Promise<{ decision: 'approved' | 'approved_for_session' | 'denied' | 'abort' }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn(`[OpenCodePermissionHandler] Permission request timed out: ${toolName}`);
        this.pendingRequests.delete(toolCallId);
        resolve({ decision: 'denied' });
      }, 60000); // 60 second timeout

      this.pendingRequests.set(toolCallId, (decision: any) => {
        clearTimeout(timeout);
        resolve(decision);
      });

      // Send permission request to mobile app
      // This will be handled by the main runner's permission message handler
      logger.debug(`[OpenCodePermissionHandler] Sending permission request to mobile for ${toolName}`);
    });
  }

  /**
   * Handle permission response from mobile app
   */
  handlePermissionResponse(toolCallId: string, decision: any): void {
    const resolver = this.pendingRequests.get(toolCallId);
    if (resolver) {
      resolver(decision);
      this.pendingRequests.delete(toolCallId);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/opencode/__tests__/unit/utils/permissionHandler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/utils/permissionHandler.ts src/opencode/__tests__/unit/utils/permissionHandler.test.ts
git commit -m "feat(opencode): implement permission handler with mobile integration"
```

---

## Task 4: Implement Reasoning Processor

**Files:**
- Create: `src/opencode/utils/reasoningProcessor.ts`
- Create: `src/opencode/__tests__/unit/utils/reasoningProcessor.test.ts`

**Step 1: Write failing test for reasoning accumulation**

Create: `src/opencode/__tests__/unit/utils/reasoningProcessor.test.ts`

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/opencode/__tests__/unit/utils/reasoningProcessor.test.ts`
Expected: FAIL with "Cannot find module '@/opencode/utils/reasoningProcessor'"

**Step 3: Implement reasoning processor**

Create: `src/opencode/utils/reasoningProcessor.ts`

```typescript
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

    this.toolCallStarted = true;
    this.emit(toolCall);

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
   */
  private emitReasoningMessage(content: string): void {
    if (!this.onMessage) {
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
   */
  private emit(message: ReasoningOutput): void {
    if (this.onMessage && !this.toolCallStarted) {
      this.onMessage(message);
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/opencode/__tests__/unit/utils/reasoningProcessor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/utils/reasoningProcessor.ts src/opencode/__tests__/unit/utils/reasoningProcessor.test.ts
git commit -m "feat(opencode): implement reasoning processor for thinking events"
```

---

## Task 5: Implement Diff Processor

**Files:**
- Create: `src/opencode/utils/diffProcessor.ts`
- Create: `src/opencode/__tests__/unit/utils/diffProcessor.test.ts`

**Step 1: Write failing test for diff parsing**

Create: `src/opencode/__tests__/unit/utils/diffProcessor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { processAcpDiff } from '@/opencode/utils/diffProcessor';

describe('DiffProcessor', () => {
  it('should calculate line changes correctly', () => {
    const diff = {
      path: '/test/file.js',
      oldText: 'line1\nline2',
      newText: 'line1\nline2\nline3',
    };

    const result = processAcpDiff(diff);

    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(0);
    expect(result.summary).toContain('+1 line');
  });

  it('should handle new files', () => {
    const diff = {
      path: '/test/new.js',
      oldText: null,
      newText: 'new content',
    };

    const result = processAcpDiff(diff);

    expect(result.linesAdded).toBeGreaterThan(0);
    expect(result.isNewFile).toBe(true);
    expect(result.summary).toContain('new file');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/opencode/__tests__/unit/utils/diffProcessor.test.ts`
Expected: FAIL with "Cannot find module '@/opencode/utils/diffProcessor'"

**Step 3: Implement diff processor**

Create: `src/opencode/utils/diffProcessor.ts`

```typescript
/**
 * Diff Processor for OpenCode - Formats ACP diffs for display
 *
 * Processes ACP diff format (oldText/newText) to generate
 * human-readable summaries for mobile and terminal display.
 */

import { logger } from '@/ui/logger';

export interface AcpDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export interface ProcessedDiff {
  path: string;
  isNewFile: boolean;
  isDeletedFile: boolean;
  linesAdded: number;
  linesRemoved: number;
  summary: string;
  preview?: string;
}

/**
 * Process an ACP diff and generate a summary
 */
export function processAcpDiff(diff: AcpDiff): ProcessedDiff {
  const { path, oldText, newText } = diff;

  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText.split('\n');

  const linesAdded = Math.max(0, newLines.length - oldLines.length);
  const linesRemoved = Math.max(0, oldLines.length - newLines.length);

  const isNewFile = oldText === null;
  const isDeletedFile = newText === null;

  let summary: string;

  if (isNewFile) {
    summary = `Created new file: ${path}`;
  } else if (isDeletedFile) {
    summary = `Deleted file: ${path}`;
  } else {
    summary = `Modified ${path}`;
    if (linesAdded > 0 || linesRemoved > 0) {
      const parts = [];
      if (linesAdded > 0) parts.push(`+${linesAdded}`);
      if (linesRemoved > 0) parts.push(`-${linesRemoved}`);
      summary += ` (${parts.join(', ')} lines)`;
    }
  }

  const preview = newText?.substring(0, 100);

  logger.debug(`[DiffProcessor] Processed diff: ${summary}`);

  return {
    path,
    isNewFile,
    isDeletedFile,
    linesAdded,
    linesRemoved,
    summary,
    preview,
  };
}

/**
 * Generate a human-readable diff summary for mobile display
 */
export function formatDiffForMobile(diff: ProcessedDiff): string {
  let output = diff.summary;

  if (diff.preview) {
    output += `\n\nPreview:\n${diff.preview}${diff.preview.length >= 100 ? '...' : ''}`;
  }

  return output;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/opencode/__tests__/unit/utils/diffProcessor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/utils/diffProcessor.ts src/opencode/__tests__/unit/utils/diffProcessor.test.ts
git commit -m "feat(opencode): implement diff processor for ACP format"
```

---

## Task 6: Implement Options Parser

**Files:**
- Create: `src/opencode/utils/optionsParser.ts`
- Create: `src/opencode/__tests__/unit/utils/optionsParser.test.ts`

**Step 1: Write failing test for options parsing**

Create: `src/opencode/__tests__/unit/utils/optionsParser.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseOptionsFromText, formatOptionsXml } from '@/opencode/utils/optionsParser';

describe('OptionsParser', () => {
  it('should parse options from XML format', () => {
    const text = 'Here are options:\n<options>\n<option id="1">Yes</option>\n<option id="2">No</option>\n</options>';
    const options = parseOptionsFromText(text);

    expect(options).toEqual([
      { id: '1', name: 'Yes' },
      { id: '2', name: 'No' },
    ]);
  });

  it('should detect incomplete options', () => {
    const text = '<options>\n<option id="1">Yes</option>';
    const incomplete = parseOptionsFromText(text);

    expect(incomplete).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/opencode/__tests__/unit/utils/optionsParser.test.ts`
Expected: FAIL with "Cannot find module '@/opencode/utils/optionsParser'"

**Step 3: Implement options parser**

Create: `src/opencode/utils/optionsParser.ts`

```typescript
/**
 * Options Parser for OpenCode - Parses response options
 *
 * Parses XML-formatted options from agent responses
 * for display in mobile app and handling user choices.
 */

import { logger } from '@/ui/logger';

export interface ParsedOption {
  id: string;
  name: string;
  description?: string;
}

/**
 * Parse options from text content
 *
 * Looks for XML-like format: <options><option id="x">Name</option></options>
 */
export function parseOptionsFromText(text: string): ParsedOption[] | null {
  const optionsRegex = /<options>([\s\S]*?)<\/options>/;
  const match = text.match(optionsRegex);

  if (!match) {
    return null;
  }

  const optionsContent = match[1];
  const optionRegex = /<option id="([^"]+)">([^<]+)<\/option>/g;
  const options: ParsedOption[] = [];
  let optionMatch;

  while ((optionMatch = optionRegex.exec(optionsContent)) !== null) {
    options.push({
      id: optionMatch[1],
      name: optionMatch[2].trim(),
    });
  }

  logger.debug(`[OptionsParser] Parsed ${options.length} options from text`);
  return options;
}

/**
 * Check if options block is incomplete
 */
export function hasIncompleteOptions(text: string): boolean {
  const hasOpeningTag = /<options>/.test(text);
  const hasClosingTag = /<\/options>/.test(text);

  return hasOpeningTag && !hasClosingTag;
}

/**
 * Format options as XML string
 */
export function formatOptionsXml(options: ParsedOption[]): string {
  const optionsXml = options
    .map(opt => `<option id="${opt.id}">${opt.name}</option>`)
    .join('\n');

  return `<options>\n${optionsXml}\n</options>`;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/opencode/__tests__/unit/utils/optionsParser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/utils/optionsParser.ts src/opencode/__tests__/unit/utils/optionsParser.test.ts
git commit -m "feat(opencode): implement options parser for responses"
```

---

## Task 7: Implement Tool Result Formatter

**Files:**
- Create: `src/opencode/utils/toolResultFormatter.ts`
- Create: `src/opencode/__tests__/unit/utils/toolResultFormatter.test.ts`

**Step 1: Write failing test for result formatting**

Create: `src/opencode/__tests__/unit/utils/toolResultFormatter.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { formatToolResult } from '@/opencode/utils/toolResultFormatter';

describe('ToolResultFormatter', () => {
  it('should format file read results', () => {
    const result = { content: 'file content' };
    const formatted = formatToolResult('read-file', result);

    expect(formatted.summary).toContain('file');
    expect(formatted.summary.length).toBeGreaterThan(0);
  });

  it('should format array results', () => {
    const result = [{ name: 'file1' }, { name: 'file2' }];
    const formatted = formatToolResult('list-files', result);

    expect(formatted.summary).toContain('2 items');
  });

  it('should format error results', () => {
    const result = { error: 'File not found' };
    const formatted = formatToolResult('read-file', result);

    expect(formatted.summary).toContain('Error');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/opencode/__tests__/unit/utils/toolResultFormatter.test.ts`
Expected: FAIL with "Cannot find module '@/opencode/utils/toolResultFormatter'"

**Step 3: Implement tool result formatter**

Create: `src/opencode/utils/toolResultFormatter.ts`

```typescript
/**
 * Tool Result Formatter - Formats tool results for display
 *
 * Converts raw tool outputs into human-readable summaries
 * for mobile app and terminal display.
 */

import { logger } from '@/ui/logger';

export interface FormattedToolResult {
  /** Human-readable summary of the result */
  summary: string;
  /** Original tool output preserved for debugging */
  raw: unknown;
}

/**
 * Format a tool result into a human-readable summary
 */
export function formatToolResult(toolName: string, result: unknown): FormattedToolResult {
  logger.debug(`[ToolResultFormatter] Formatting result for ${toolName}`);

  const summary = formatResult(result);

  return {
    summary,
    raw: result,
  };
}

/**
 * Format any result type into a summary string
 */
function formatResult(result: unknown): string {
  if (result === null || result === undefined) {
    return 'No output';
  }

  if (typeof result === 'string') {
    if (result.length === 0) return 'Empty string';
    return result.length > 200 ? `${result.substring(0, 200)}...` : result;
  }

  if (typeof result === 'number' || typeof result === 'boolean') {
    return String(result);
  }

  if (Array.isArray(result)) {
    if (result.length === 0) return 'Empty array';

    const firstItem = result[0];
    if (typeof firstItem === 'object' && firstItem !== null) {
      const previewFields = ['name', 'path', 'content', 'title', 'message', 'file'];
      const previewField = previewFields.find(f => f in firstItem);
      if (previewField) {
        const preview = String((firstItem as Record<string, unknown>)[previewField]).substring(0, 50);
        return `${result.length} items (first: "${preview}${preview.length >= 50 ? '...' : ''}")`;
      }
    }
    return `${result.length} items`;
  }

  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return 'Empty object';

    if ('error' in obj) {
      return `Error: ${String(obj.error).substring(0, 100)}`;
    }

    if ('success' in obj) {
      return obj.success ? 'Success' : 'Failed';
    }

    const keyPreview = keys.slice(0, 3).join(', ');
    const suffix = keys.length > 3 ? '...' : '';
    return `Object with ${keys.length} fields: ${keyPreview}${suffix}`;
  }

  return 'Unknown result type';
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/opencode/__tests__/unit/utils/toolResultFormatter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/utils/toolResultFormatter.ts src/opencode/__tests__/unit/utils/toolResultFormatter.test.ts
git commit -m "feat(opencode): implement tool result formatter"
```

---

## Task 8: Create OpenCode Display Component

**Files:**
- Create: `src/ui/ink/OpenCodeDisplay.ts`

**Step 1: Write display component**

Create: `src/ui/ink/OpenCodeDisplay.ts`

```typescript
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

  // Auto-scroll to latest message
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
        <RenderMessage key={msg.id || idx} message={msg} />
      ))}
    </Box>
  );
}

function RenderMessage({ message }: { message: AgentMessage }) {
  switch (message.type) {
    case 'text':
      return (
        <Box>
          <Text>{message.text}</Text>
        </Box>
      );

    case 'tool-call':
      return (
        <Box>
          <Text color="yellow">➜ {message.toolName}</Text>
          {message.status && (
            <Text color="gray"> ({message.status})</Text>
          )}
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
          {message.output !== undefined && (
            <Text color="dim">{String(message.output)}</Text>
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
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/ink/OpenCodeDisplay.ts
git commit -m "feat(opencode): add ink display component"
```

---

## Task 9: Implement Session Persistence

**Files:**
- Create: `src/opencode/utils/sessionPersistence.ts`
- Create: `src/opencode/__tests__/unit/utils/sessionPersistence.test.ts`

**Step 1: Write failing test for session persistence**

Create: `src/opencode/__tests__/unit/utils/sessionPersistence.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveSessionForDirectory, getLastSessionForDirectory } from '@/opencode/utils/sessionPersistence';
import type { OpenCodeSessionMetadata } from '@/opencode/types';

describe('SessionPersistence', () => {
  const testDir = '/test/working/directory';

  afterEach(async () => {
    // Clean up test files
    // Implementation depends on storage method
  });

  it('should save session for directory', async () => {
    const session: OpenCodeSessionMetadata = {
      opencodeSessionId: 'session-123',
      directory: testDir,
      startedAt: Date.now(),
      model: 'claude-sonnet-4',
    };

    await saveSessionForDirectory(session);

    const retrieved = await getLastSessionForDirectory(testDir);
    expect(retrieved).toEqual(session);
  });

  it('should return null for non-existent directory', async () => {
    const result = await getLastSessionForDirectory('/non/existent');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/opencode/__tests__/unit/utils/sessionPersistence.test.ts`
Expected: FAIL with "Cannot find module '@/opencode/utils/sessionPersistence'"

**Step 3: Implement session persistence**

Create: `src/opencode/utils/sessionPersistence.ts`

```typescript
/**
 * Session Persistence for OpenCode
 *
 * Saves and retrieves OpenCode session metadata for resumption.
 * Uses local storage indexed by working directory hash.
 */

import { join, dirname } from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { createHash } from 'crypto';
import { logger } from '@/ui/logger';
import type { OpenCodeSessionMetadata } from '../types';

/**
 * Directory for storing session metadata
 */
const SESSION_DIR = join(homedir(), '.happy-dev', 'opencode', 'sessions');

/**
 * Hash a directory path to create a safe filename
 */
function hashDirectory(dir: string): string {
  return createHash('sha256').update(dir).digest('hex').substring(0, 16);
}

/**
 * Get the session file path for a directory
 */
function getSessionFilePath(dir: string): string {
  const hash = hashDirectory(dir);
  return join(SESSION_DIR, `${hash}.json`);
}

/**
 * Save session metadata for a directory
 */
export async function saveSessionForDirectory(session: OpenCodeSessionMetadata): Promise<void> {
  try {
    // Ensure session directory exists
    await mkdir(SESSION_DIR, { recursive: true });

    const filePath = getSessionFilePath(session.directory);
    const data = JSON.stringify(session, null, 2);

    await writeFile(filePath, data, 'utf-8');

    logger.debug(`[SessionPersistence] Saved session for ${session.directory}: ${session.opencodeSessionId}`);
  } catch (error) {
    logger.error('[SessionPersistence] Failed to save session:', error);
  }
}

/**
 * Get the last session for a directory
 */
export async function getLastSessionForDirectory(dir: string): Promise<OpenCodeSessionMetadata | null> {
  try {
    const filePath = getSessionFilePath(dir);
    const data = await readFile(filePath, 'utf-8');

    const session: OpenCodeSessionMetadata = JSON.parse(data);

    logger.debug(`[SessionPersistence] Retrieved session for ${dir}: ${session.opencodeSessionId}`);

    return session;
  } catch (error) {
    logger.debug(`[SessionPersistence] No session found for ${dir}`);
    return null;
  }
}

/**
 * Delete session metadata for a directory
 */
export async function deleteSessionForDirectory(dir: string): Promise<void> {
  try {
    const filePath = getSessionFilePath(dir);
    await unlink(filePath);

    logger.debug(`[SessionPersistence] Deleted session for ${dir}`);
  } catch (error) {
    logger.debug(`[SessionPersistence] No session to delete for ${dir}`);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/opencode/__tests__/unit/utils/sessionPersistence.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/utils/sessionPersistence.ts src/opencode/__tests__/unit/utils/sessionPersistence.test.ts
git commit -m "feat(opencode): implement session persistence for resumption"
```

---

## Task 10: Implement Main Runner (Stub)

**Files:**
- Create: `src/opencode/runOpenCode.ts`

**Step 1: Write basic runner stub**

```typescript
/**
 * OpenCode CLI Entry Point
 *
 * This module provides main entry point for running OpenCode agent
 * through Happy CLI. It manages the agent lifecycle, session state, and
 * communication with Happy server and mobile app.
 *
 * Based on the design but minimal stub for initial implementation.
 */

import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { join, resolve } from 'node:path';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { AgentState, Metadata } from '@/api/types';
import { initialMachineMetadata } from '@/daemon/run';
import { configuration } from '@/configuration';
import packageJson from '../../package.json';

import { OpenCodeDisplay } from '@/ui/ink/OpenCodeDisplay';
import { readOpenCodeLocalConfig, getInitialOpenCodeModel } from './utils/config';
import type { OpenCodeMode, OpenCodeMessagePayload } from './types';

/**
 * Main entry point for opencode command with ink UI
 */
export async function runOpenCode(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  cwd?: string;
  model?: string;
  initialPrompt?: string;
  resumeSessionId?: string;
  forceNewSession?: boolean;
  sessionMode?: 'default' | 'yolo' | 'safe';
}): Promise<void> {
  logger.debug('[OpenCode] Starting OpenCode session');

  const sessionTag = randomUUID();
  const api = await ApiClient.create(opts.credentials);

  // Machine
  const settings = await readSettings();
  const machineId = settings?.machineId;
  if (!machineId) {
    console.error('[START] No machine ID found. Please run "happy auth login" first.');
    process.exit(1);
  }

  await api.getOrCreateMachine({
    machineId,
    metadata: initialMachineMetadata
  });

  // Session state
  const state: AgentState = {
    controlledByUser: false,
  };

  const metadata: Metadata = {
    path: opts.cwd || process.cwd(),
    host: os.hostname(),
    version: packageJson.version,
    os: os.platform(),
    machineId,
    homeDir: os.homedir(),
    happyHomeDir: configuration.happyHomeDir,
    happyLibDir: resolve(configuration.happyHomeDir, 'lib'),
    startedFromDaemon: opts.startedBy === 'daemon',
    hostPid: process.pid,
    startedBy: opts.startedBy || 'terminal',
    lifecycleState: 'running',
    lifecycleStateSince: Date.now(),
    flavor: 'opencode'
  };

  const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
  const session = api.sessionSyncClient(response);

  // Model configuration
  const localConfig = readOpenCodeLocalConfig();
  const model = opts.model || getInitialOpenCodeModel();

  logger.debug(`[OpenCode] Using model: ${model}`);

  // Placeholder for UI rendering
  const { waitUntilExit } = render(
    React.createElement(OpenCodeDisplay, {
      messages: [],
      onInput: () => {},
      onCancel: () => {},
      model,
      sessionMode: opts.sessionMode || 'default',
    })
  );

  await waitUntilExit();

  logger.debug('[OpenCode] Session ended');
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/opencode/runOpenCode.ts
git commit -m "feat(opencode): add basic runner stub"
```

---

## Task 11: Update CLI Entry Point

**Files:**
- Modify: `src/index.ts`

**Step 1: Remove placeholder and implement real opencode command**

Modify: `src/index.ts`

Find the opencode command handling (around line after gemini command) and replace the placeholder with:

```typescript
  } else if (subcommand === 'opencode') {
    // Handle opencode subcommands
    const opencodeSubcommand = args[1];

    // Handle "happy opencode model set <model>" command
    if (opencodeSubcommand === 'model' && args[2] === 'set' && args[3]) {
      const modelName = args[3];
      const { isOpenCodeModelValid, saveOpenCodeModelToConfig, getAvailableOpenCodeModels } = await import('@/opencode/utils/config');

      if (!isOpenCodeModelValid(modelName)) {
        console.error(`Invalid model: ${modelName}`);
        console.error(getAvailableOpenCodeModels());
        process.exit(1);
      }

      try {
        saveOpenCodeModelToConfig(modelName);
        console.log(`✓ Model set to: ${modelName}`);
        console.log(`  Config saved to: ~/.config/opencode/config.json`);
        console.log(`  This model will be used in future sessions.`);
        process.exit(0);
      } catch (error) {
        console.error('Failed to save model configuration:', error);
        process.exit(1);
      }
    }

    // Handle "happy opencode model get" command
    if (opencodeSubcommand === 'model' && args[2] === 'get') {
      try {
        const { readOpenCodeLocalConfig, getInitialOpenCodeModel } = await import('@/opencode/utils/config');
        const localConfig = readOpenCodeLocalConfig();

        if (localConfig.model) {
          console.log(`Current model: ${localConfig.model}`);
        } else {
          console.log(`Current model: ${getInitialOpenCodeModel()} (default)`);
        }
        process.exit(0);
      } catch (error) {
        console.error('Failed to read model configuration:', error);
        process.exit(1);
      }
    }

    // Handle opencode command (ACP-based agent)
    try {
      const { runOpenCode } = await import('@/opencode/runOpenCode');

      // Parse startedBy argument
      let startedBy: 'daemon' | 'terminal' | undefined = undefined;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--started-by') {
          startedBy = args[++i] as 'daemon' | 'terminal';
        }
      }

      const { credentials } = await authAndSetupMachineIfNeeded();

      // Auto-start daemon for opencode (same as claude)
      logger.debug('Ensuring Happy background service is running & matches our version...');
      if (!(await isDaemonRunningCurrentlyInstalledHappyVersion())) {
        logger.debug('Starting Happy background service...');
        const daemonProcess = spawnHappyCLI(['daemon', 'start-sync'], {
          detached: true,
          stdio: 'ignore',
          env: process.env
        });
        daemonProcess.unref();
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      await runOpenCode({credentials, startedBy});
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error')
      if (process.env.DEBUG) {
        console.error(error)
      }
      process.exit(1)
    }
    return;
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Build**

Run: `npm run build`
Expected: PASS

**Step 4: Test model commands**

```bash
node bin/happy.mjs opencode model get
node bin/happy.mjs opencode model set claude-sonnet-4
```

Expected: Commands execute successfully

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(opencode): integrate opencode command in CLI"
```

---

## Task 12: Add Daemon Support

**Files:**
- Modify: `src/daemon/run.ts`

**Step 1: Add opencode case to daemon**

Modify: `src/daemon/run.ts`

Find the switch statement for agent commands (around line 261-277) and add opencode case:

```typescript
        let agentCommand: string;
        switch (options.agent) {
          case 'claude':
          case undefined:
            agentCommand = 'claude';
            break;
          case 'codex':
            agentCommand = 'codex';
            break;
          case 'gemini':
            agentCommand = 'gemini';
            break;
          case 'opencode':
            agentCommand = 'opencode';
            break;
          default:
            return {
              type: 'error',
              errorMessage: `Unsupported agent type: '${options.agent}'. Please update your CLI to the latest version.`
            };
        }
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Build**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/daemon/run.ts
git commit -m "feat(opencode): add daemon support for opencode agent"
```

---

## Task 13: Update API Session Types

**Files:**
- Modify: `src/api/apiSession.ts:256`

**Step 1: Add opencode to agent type**

Modify: `src/api/apiSession.ts`

Find the sendAgentMessage method signature and update the agentType parameter:

```typescript
  sendAgentMessage(agentType: 'gemini' | 'codex' | 'claude' | 'opencode', body: any): void {
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/api/apiSession.ts
git commit -m "feat(opencode): add opencode to API session types"
```

---

## Task 14: Write ACP Backend Integration Tests

**Files:**
- Create: `src/opencode/__tests__/integration/acp/acpBackend.test.ts`

**Step 1: Write integration test for ACP backend**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOpenCodeBackend } from '@/agent/acp/opencode';
import type { AgentBackend } from '@/agent/AgentBackend';

describe('OpenCode ACP Backend Integration', () => {
  let backend: AgentBackend | null = null;

  beforeAll(async () => {
    // Skip tests if OpenCode CLI is not installed
    try {
      const { execSync } = require('child_process');
      execSync('opencode --version', { stdio: 'ignore' });
    } catch {
      console.warn('OpenCode CLI not installed, skipping integration tests');
      return;
    }

    backend = createOpenCodeBackend({
      cwd: process.cwd(),
    });
  });

  afterAll(async () => {
    if (backend) {
      await backend.dispose();
    }
  });

  it('should initialize successfully', async () => {
    if (!backend) return;

    await backend.startSession('test prompt');
    // Should not throw
  }, { timeout: 30000 });

  it('should handle messages', async () => {
    if (!backend) return;

    const messages: any[] = [];

    backend.onMessage((msg) => {
      messages.push(msg);
    });

    await backend.startSession('test');

    // Wait for initialization messages
    await new Promise(resolve => setTimeout(resolve, 2000));

    expect(messages.length).toBeGreaterThan(0);
  }, { timeout: 30000 });
});
```

**Step 2: Run integration tests**

Run: `npm test -- src/opencode/__tests__/integration/acp/acpBackend.test.ts`
Expected: PASS (or skipped if OpenCode not installed)

**Step 3: Commit**

```bash
git add src/opencode/__tests__/integration/acp/acpBackend.test.ts
git commit -m "test(opencode): add ACP backend integration tests"
```

---

## Task 15: Write Session Lifecycle Tests

**Files:**
- Create: `src/opencode/__tests__/integration/session/lifecycle.test.ts`

**Step 1: Write session lifecycle tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveSessionForDirectory, getLastSessionForDirectory, deleteSessionForDirectory } from '@/opencode/utils/sessionPersistence';
import type { OpenCodeSessionMetadata } from '@/opencode/types';

describe('Session Lifecycle', () => {
  const testDir = '/tmp/test-opencode-session';

  afterEach(async () => {
    await deleteSessionForDirectory(testDir);
  });

  it('should save and retrieve session', async () => {
    const session: OpenCodeSessionMetadata = {
      opencodeSessionId: 'test-session-123',
      directory: testDir,
      startedAt: Date.now(),
      model: 'claude-sonnet-4',
    };

    await saveSessionForDirectory(session);

    const retrieved = await getLastSessionForDirectory(testDir);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.opencodeSessionId).toBe(session.opencodeSessionId);
    expect(retrieved?.model).toBe(session.model);
  });

  it('should overwrite existing session', async () => {
    const session1: OpenCodeSessionMetadata = {
      opencodeSessionId: 'session-1',
      directory: testDir,
      startedAt: Date.now(),
      model: 'claude-sonnet-4',
    };

    const session2: OpenCodeSessionMetadata = {
      opencodeSessionId: 'session-2',
      directory: testDir,
      startedAt: Date.now() + 1000,
      model: 'gemini-2.5-pro',
    };

    await saveSessionForDirectory(session1);
    await saveSessionForDirectory(session2);

    const retrieved = await getLastSessionForDirectory(testDir);

    expect(retrieved?.opencodeSessionId).toBe('session-2');
  });

  it('should return null for deleted session', async () => {
    const session: OpenCodeSessionMetadata = {
      opencodeSessionId: 'test-session',
      directory: testDir,
      startedAt: Date.now(),
      model: 'claude-sonnet-4',
    };

    await saveSessionForDirectory(session);
    await deleteSessionForDirectory(testDir);

    const retrieved = await getLastSessionForDirectory(testDir);

    expect(retrieved).toBeNull();
  });
});
```

**Step 2: Run tests**

Run: `npm test -- src/opencode/__tests__/integration/session/lifecycle.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/opencode/__tests__/integration/session/lifecycle.test.ts
git commit -m "test(opencode): add session lifecycle integration tests"
```

---

## Task 16: Write Permission Flow Tests

**Files:**
- Create: `src/opencode/__tests__/integration/permissions/permissionFlow.test.ts`

**Step 1: Write permission flow tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenCodePermissionHandler } from '@/opencode/utils/permissionHandler';

describe('Permission Flow Integration', () => {
  let handler: OpenCodePermissionHandler;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      sendPermissionRequest: vi.fn(),
    };
    handler = new OpenCodePermissionHandler(mockApiClient);
  });

  it('should approve read operations in read-only mode', async () => {
    handler.setPermissionMode('read-only');

    const decision = await handler.handleToolCall('call-1', 'read-file', {});

    expect(decision.decision).toBe('approved_for_session');
  });

  it('should reject write operations in read-only mode', async () => {
    handler.setPermissionMode('read-only');

    const decision = await handler.handleToolCall('call-1', 'write-file', {});

    expect(decision.decision).toBe('denied');
  });

  it('should auto-approve in yolo mode', async () => {
    handler.setPermissionMode('yolo');

    const decision = await handler.handleToolCall('call-1', 'write-file', {});

    expect(decision.decision).toBe('approved');
  });

  it('should timeout after 60 seconds', async () => {
    const startTime = Date.now();
    handler.setPermissionMode('default');

    const promise = handler.handleToolCall('call-1', 'write-file', {});
    await promise;

    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeGreaterThanOrEqual(60000);
    expect(elapsed).toBeLessThan(65000); // Allow 5s margin
  });
});
```

**Step 2: Run tests**

Run: `npm test -- src/opencode/__tests__/integration/permissions/permissionFlow.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/opencode/__tests__/integration/permissions/permissionFlow.test.ts
git commit -m "test(opencode): add permission flow integration tests"
```

---

## Task 17: Create Design Document

**Files:**
- Create: `docs/opencode-acp-architecture.md`

**Step 1: Write architecture documentation**

```markdown
# OpenCode ACP Support Architecture

## Overview

This document describes the architecture of OpenCode ACP support in Happy CLI.

## Components

### 1. ACP Backend Factory
- **File:** `src/agent/acp/opencode.ts`
- **Responsibility:** Creates OpenCode backend using `AcpSdkBackend`
- **Command:** `opencode acp`

### 2. Permission Handler
- **File:** `src/opencode/utils/permissionHandler.ts`
- **Responsibility:** Maps permission modes to ACP responses, handles mobile app integration

### 3. Reasoning Processor
- **File:** `src/opencode/utils/reasoningProcessor.ts`
- **Responsibility:** Accumulates and formats thinking events from OpenCode

### 4. Diff Processor
- **File:** `src/opencode/utils/diffProcessor.ts`
- **Responsibility:** Formats ACP diffs for display

### 5. Session Persistence
- **File:** `src/opencode/utils/sessionPersistence.ts`
- **Responsibility:** Saves/retrieves session metadata for resumption

## Data Flow

```
User Input → CLI → runOpenCode → ACP Backend → opencode acp
                                                    ↓
                                            session/update notifications
                                                    ↓
                                            Message Queue → Processors → UI + Server
```

## ACP Protocol Support

### Implemented Features
- ✅ Session lifecycle (create, load, resume)
- ✅ Tool permissions (request/response)
- ✅ MCP servers (stdio transport)
- ✅ Session modes (ask/architect/code)
- ✅ Thinking events
- ✅ Diff display
- ✅ Plans (if emitted)
- ✅ Slash commands

## Mobile Integration

Messages are sent via `apiSession.sendAgentMessage('opencode', payload)` using Codex format for compatibility.

## Authentication

OpenCode uses `~/.config/opencode/config.json` for authentication and model configuration. Happy can optionally store credentials via `happy connect opencode`.
```

**Step 2: Commit**

```bash
git add docs/opencode-acp-architecture.md
git commit -m "docs(opencode): add architecture documentation"
```

---

## Task 18: Full Integration Test (Manual)

**Files:**
- None

**Step 1: Build the project**

```bash
npm run build
```

Expected: PASS with no TypeScript errors

**Step 2: Test model commands**

```bash
node bin/happy.mjs opencode model get
node bin/happy.mjs opencode model set claude-sonnet-4
node bin/happy.mjs opencode model get
```

Expected: Model commands work correctly

**Step 3: Test basic session (requires OpenCode CLI installed)**

```bash
node bin/happy.mjs opencode --help
```

Expected: Help shows opencode command

**Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 5: Final commit**

```bash
git add .
git commit -m "feat(opencode): complete OpenCode ACP support implementation

- Add ACP backend factory and registration
- Implement permission handler with mobile integration
- Implement reasoning processor for thinking events
- Implement diff processor for ACP format
- Implement options parser for responses
- Implement tool result formatter
- Implement session persistence for resumption
- Add OpenCode display component
- Add CLI command integration
- Add daemon support
- Update API types for opencode
- Add comprehensive unit and integration tests
- Add architecture documentation

Full ACP protocol support including:
- Session lifecycle
- Tool permissions
- MCP servers
- Session modes
- Thinking events
- Diff display
- Mobile app integration"
```

---

## Completion Criteria

All tasks complete when:
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ `npm run typecheck` succeeds with no errors
- ✅ `npm run build` succeeds
- ✅ `happy opencode model get/set` commands work
- ✅ Documentation is complete
- ✅ Code is committed to git

## Notes for Implementation

1. **OpenCode CLI dependency:** Users must install OpenCode CLI separately via `npm install -g opencode`
2. **Testing without OpenCode:** Integration tests will skip if OpenCode CLI is not installed
3. **Mobile app integration:** Backend must be updated to handle 'opencode' agent type
4. **Session resumption:** Uses local storage in `~/.happy-dev/opencode/sessions/`
5. **Error handling:** All errors logged to file, not console (except user-facing errors)
6. **Type safety:** All code must pass TypeScript strict mode

## Next Steps After Implementation

1. Update backend (handy-server) to support 'opencode' agent type
2. Update mobile app to display OpenCode-specific UI elements
3. Add E2E tests with real OpenCode CLI
4. Add performance benchmarks for large prompts
5. Add integration tests for MCP servers

---

**Plan complete!** Total estimated time: 2-3 weeks for full implementation.
