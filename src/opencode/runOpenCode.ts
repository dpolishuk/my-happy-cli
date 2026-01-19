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
import { resolve } from 'node:path';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import type { AgentState, Metadata, UserMessage } from '@/api/types';
import { initialMachineMetadata } from '@/daemon/run';
import { configuration } from '@/configuration';
import packageJson from '../../package.json';

import { OpenCodeDisplay } from '@/ui/ink/OpenCodeDisplay';
import type { RawJSONLines } from '@/claude/types';
import type { AgentBackend, AgentMessage, SessionId } from '@/agent/AgentBackend';
import { createOpenCodeBackend } from '@/agent/acp/opencode';
import { formatToolResult } from '@/opencode/utils/toolResultFormatter';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { OpenCodePermissionHandler } from '@/opencode/utils/permissionHandler';
import { getInitialOpenCodeModel } from './utils/config';

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

  //
  // Machine
  //

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

  //
  // Session state
  //

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
    happyToolsDir: resolve(configuration.happyHomeDir, 'tools', 'unpacked'),
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
  const model = opts.model || getInitialOpenCodeModel();
  logger.debug(`[OpenCode] Using model: ${model}`);

  const controller = await createOpenCodeRemoteController({
    sessionClient: session,
    metadata,
  });

  // Render UI (best-effort): keep minimal for now, but don't block remote operation.
  const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
  if (hasTTY) {
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
  } else {
    // Keep process alive for remote control.
    await new Promise(() => {});
  }

  await controller.dispose();

  logger.debug('[OpenCode] Session ended');
}

export async function createOpenCodeRemoteController(opts: {
  sessionClient: {
    sessionId: string;
    onUserMessage: (callback: (msg: UserMessage) => void) => void;
    sendClaudeSessionMessage: (msg: RawJSONLines) => void;
    sendSessionEvent: (event: { type: 'ready' } | { type: 'message'; message: string }) => void;
    sendCodexMessage?: (msg: any) => void;
    keepAlive: (thinking: boolean, mode: 'local' | 'remote') => void;
    rpcHandlerManager: { registerHandler: (name: string, handler: (...args: any[]) => any) => void };
  };
  metadata: Metadata;
  notifyDaemonSessionStarted?: (sessionId: string, metadata: Metadata) => Promise<{ error?: string } | any>;
  createBackend?: (args: { cwd: string; model: string; sessionClient: any }) => AgentBackend;
}): Promise<{ dispose: () => Promise<void> }> {
  const session = opts.sessionClient;
  const reportToDaemon = opts.notifyDaemonSessionStarted ?? notifyDaemonSessionStarted;

  // Ensure the daemon can see this session.
  try {
    const res = await reportToDaemon(session.sessionId, opts.metadata);
    if (res?.error) {
      logger.debug('[OpenCode] Failed to report session to daemon:', res.error);
    }
  } catch (error) {
    logger.debug('[OpenCode] Failed to report session to daemon:', error);
  }

  const permissionHandler = new OpenCodePermissionHandler(session as any);

  // Map OpenCode sessionMode -> permission handler
  if (opts.metadata.startedBy) {
    // no-op; placeholder for future
  }

  const backendFactory = opts.createBackend ?? ((args) => createOpenCodeBackend({
    cwd: args.cwd,
    model: args.model,
    permissionHandler,
  }) as unknown as AgentBackend);

  const backend = backendFactory({
    cwd: opts.metadata.path,
    model: getInitialOpenCodeModel(),
    sessionClient: session,
  });

  let acpSessionId: SessionId | null = null;
  let thinking = false;

  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, 'remote');
  }, 2000);

  let lastAssistantUuid: string | null = null;

  function sendAssistantDelta(text: string): void {
    // IMPORTANT: Happy UI expects Claude-style assistant messages to include `message.model`.
    // Without it, the UI drops the message (normalizeRawMessage requires it).
    const uuid = randomUUID();

    const msg: RawJSONLines = {
      type: 'assistant',
      uuid,
      parentUuid: lastAssistantUuid,
      message: {
        role: 'assistant',
        model: 'opencode',
        content: [{ type: 'text', text }],
      },
    } as any;

    session.sendClaudeSessionMessage(msg);
    lastAssistantUuid = uuid;
  }

  const sendCodexEvent = (event: { type: string; [key: string]: unknown }): void => {
    if (session.sendCodexMessage) {
      // Match the existing "codex" channel the UI already understands.
      const { type, ...rest } = event;
      session.sendCodexMessage({
        type,
        id: randomUUID(),
        ...rest,
      });
      return;
    }

    // Fallback: human-readable assistant text.
    sendAssistantDelta(String(event.type));
  };

  backend.onMessage((msg: AgentMessage) => {
    switch (msg.type) {
      case 'status':
        thinking = msg.status === 'running' || msg.status === 'starting';
        if (msg.status === 'running') {
          sendCodexEvent({ type: 'task_started' });
          session.sendSessionEvent({ type: 'message', message: 'Task started' });
          sendAssistantDelta('Task started');
        }
        if (msg.status === 'idle' || msg.status === 'stopped') {
          sendCodexEvent({ type: 'task_complete' });
          session.sendSessionEvent({ type: 'ready' });
          sendAssistantDelta('Task complete');
        }
        if (msg.status === 'error') {
          sendCodexEvent({ type: 'turn_aborted' });
          session.sendSessionEvent({ type: 'message', message: 'Turn aborted' });
          sendAssistantDelta('Turn aborted');
        }
        break;
      case 'model-output':
        if (msg.textDelta) {
          sendAssistantDelta(msg.textDelta);
        }
        break;
      case 'tool-call': {
        // Flatten tool calls into assistant text.
        const toolLine = `Tool call: ${msg.toolName}`;
        sendAssistantDelta(toolLine);
        break;
      }
      case 'tool-result': {
        const formatted = formatToolResult(msg.toolName, msg.result);
        const summary = formatted.summary.length > 1000
          ? `${formatted.summary.slice(0, 1000)}...`
          : formatted.summary;
        sendAssistantDelta(`Tool result: ${msg.toolName} — ${summary}`);
        break;
      }
      case 'permission-request':
        sendAssistantDelta(`Permission requested: ${msg.reason}`);
        break;
      case 'event':
        sendAssistantDelta(`Event: ${msg.name}`);
        break;
      default:
        break;
    }
  });

  session.onUserMessage(async (message: UserMessage) => {
    const prompt = message.content.text;

    // Reset per-turn threading so separate user turns don't chain together.
    lastAssistantUuid = null;

    if (!acpSessionId) {
      const started = await backend.startSession();
      acpSessionId = started.sessionId;
    }

    await backend.sendPrompt(acpSessionId, prompt);
  });

  // Initial ready
  session.sendSessionEvent({ type: 'ready' });

  return {
    dispose: async () => {
      clearInterval(keepAliveInterval);
      try {
        if (acpSessionId) {
          await backend.cancel(acpSessionId);
        }
      } catch (error) {
        logger.debug('[OpenCode] cancel failed during dispose:', error);
      }
      await backend.dispose();
    }
  };
}
