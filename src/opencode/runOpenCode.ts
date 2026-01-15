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
