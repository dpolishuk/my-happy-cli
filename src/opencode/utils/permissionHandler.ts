/**
 * OpenCode Permission Handler
 *
 * Handles tool permission requests from OpenCode ACP backend,
 * integrating with Happy server for mobile app approval flow.
 */

import { ApiSessionClient } from '@/api/apiSession';
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
  'grep',
]);

/**
 * Write-only tool types that should be rejected in read-only mode
 */
const WRITE_TOOLS = new Set([
  'write-file',
  'delete-file',
  'create-file',
  'edit-file',
  'patch-file',
]);

/**
 * Permission response from mobile app
 */
interface PermissionResponse {
  id: string;
  approved: boolean;
  decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

/**
 * Permission decision result
 */
interface PermissionDecision {
  decision: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

/**
 * Pending permission request data
 */
interface PendingRequest {
  resolve: (decision: PermissionDecision) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: unknown;
  timeout: NodeJS.Timeout;
}

export class OpenCodePermissionHandler implements AcpPermissionHandler {
  private permissionMode: PermissionMode = 'default';
  private pendingRequests = new Map<string, PendingRequest>();
  private rpcHandlerRegistered = false;

  constructor(private session: ApiSessionClient) {
    this.setupRpcHandler();
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
  ): Promise<PermissionDecision> {
    logger.debug(`[OpenCodePermissionHandler] Permission request: ${toolName} (${toolCallId})`);

    // YOLO mode: auto-approve everything
    if (this.permissionMode === 'yolo' || this.permissionMode === 'safe-yolo') {
      logger.debug(`[OpenCodePermissionHandler] YOLO mode - auto-approving ${toolName}`);
      return { decision: 'approved' };
    }

    // Read-only mode: allow read operations, reject write operations
    if (this.permissionMode === 'read-only') {
      const isWriteTool = WRITE_TOOLS.has(toolName) || 
                         !READ_ONLY_TOOLS.has(toolName);
      
      if (isWriteTool) {
        logger.debug(`[OpenCodePermissionHandler] Read-only mode - rejecting ${toolName}`);
        return { decision: 'denied' };
      } else {
        logger.debug(`[OpenCodePermissionHandler] Read-only mode - allowing read-only tool ${toolName}`);
        return { decision: 'approved' };
      }
    }

    // Default mode: send request to mobile app
    return this.requestPermissionViaMobile(toolCallId, toolName, input);
  }

  /**
   * Send permission request to mobile app via Happy server
   * Updates agent state to signal pending request, then waits for RPC response
   */
  private requestPermissionViaMobile(
    toolCallId: string,
    toolName: string,
    input: unknown
  ): Promise<PermissionDecision> {
    return new Promise<PermissionDecision>((resolve, reject) => {
      // Set up timeout (60 seconds)
      const timeout = setTimeout(() => {
        logger.warn(`[OpenCodePermissionHandler] Permission request timed out: ${toolName}`);
        this.pendingRequests.delete(toolCallId);
        resolve({ decision: 'denied' });
      }, 60000);

      // Store the pending request
      this.pendingRequests.set(toolCallId, {
        resolve,
        reject,
        toolName,
        input,
        timeout,
      });

      // Update agent state to signal pending permission request to mobile app
      try {
        this.session.updateAgentState((currentState) => ({
          ...currentState,
          requests: {
            ...(currentState.requests || {}),
            [toolCallId]: {
              tool: toolName,
              arguments: input,
              createdAt: Date.now(),
            },
          },
        }));
        logger.debug(`[OpenCodePermissionHandler] Updated agent state for pending permission: ${toolName}`);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(toolCallId);
        logger.debug(`[OpenCodePermissionHandler] Failed to update agent state:`, error);
        reject(error instanceof Error ? error : new Error('Failed to update agent state'));
      }
    });
  }

  /**
   * Setup RPC handler for permission responses from mobile app
   */
  private setupRpcHandler(): void {
    if (this.rpcHandlerRegistered) {
      return;
    }

    this.session.rpcHandlerManager.registerHandler<PermissionResponse, void>(
      'permission',
      async (response) => {
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
          logger.debug(`[OpenCodePermissionHandler] No pending request found for ${response.id}`);
          return;
        }

        // Clear timeout
        clearTimeout(pending.timeout);

        // Remove from pending
        this.pendingRequests.delete(response.id);

        // Map response to decision
        let decision: 'approved' | 'approved_for_session' | 'denied' | 'abort';
        
        if (response.approved) {
          decision = response.decision === 'approved_for_session' ? 'approved_for_session' : 'approved';
        } else {
          decision = response.decision === 'abort' ? 'abort' : 'denied';
        }

        // Resolve the promise
        pending.resolve({ decision });

        // Update agent state to move request to completed
        try {
          this.session.updateAgentState((currentState) => {
            const request = currentState.requests?.[response.id];
            if (!request) return currentState;

            const { [response.id]: _, ...remainingRequests } = currentState.requests || {};

            return {
              ...currentState,
              requests: remainingRequests,
              completedRequests: {
                ...(currentState.completedRequests || {}),
                [response.id]: {
                  ...request,
                  completedAt: Date.now(),
                  status: response.approved ? 'approved' : 'denied',
                  decision,
                },
              },
            };
          });
        } catch (error) {
          logger.debug('[OpenCodePermissionHandler] Failed to update agent state after permission response:', error);
        }

        logger.debug(`[OpenCodePermissionHandler] Permission ${decision} for ${pending.toolName}`);
      }
    );

    this.rpcHandlerRegistered = true;
    logger.debug('[OpenCodePermissionHandler] RPC handler registered');
  }

  /**
   * Handle permission response from mobile app
   * This is an alternative method that can be called directly
   * @deprecated Use RPC handler instead
   */
  handlePermissionResponse(toolCallId: string, decision: PermissionDecision): void {
    const pending = this.pendingRequests.get(toolCallId);
    if (!pending) {
      logger.debug(`[OpenCodePermissionHandler] No pending request found for ${toolCallId}`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);

    // Remove from pending
    this.pendingRequests.delete(toolCallId);

    // Resolve the promise
    pending.resolve(decision);

    logger.debug(`[OpenCodePermissionHandler] Permission ${decision.decision} for ${pending.toolName}`);
  }

  /**
   * Reset state (e.g., for new sessions)
   */
  reset(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Permission handler reset'));
    }
    this.pendingRequests.clear();

    logger.debug('[OpenCodePermissionHandler] Reset');
  }
}
