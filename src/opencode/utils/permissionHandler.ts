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

    // Default mode: approve for session
    if (this.permissionMode === 'default') {
      logger.debug(`[OpenCodePermissionHandler] Default mode - approving ${toolName} for session`);
      return { decision: 'approved_for_session' };
    }

    // Read-only mode: reject write operations
    if (this.permissionMode === 'read-only' && WRITE_TOOLS.has(toolName)) {
      logger.debug(`[OpenCodePermissionHandler] Read-only mode - rejecting ${toolName}`);
      return { decision: 'denied' };
    }

    // Default: ask via mobile app
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
