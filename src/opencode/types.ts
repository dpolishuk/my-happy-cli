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
