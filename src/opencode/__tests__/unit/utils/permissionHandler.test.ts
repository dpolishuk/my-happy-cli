import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodePermissionHandler } from '@/opencode/utils/permissionHandler';
import type { PermissionMode } from '@/opencode/types';
import type { ApiSessionClient } from '@/api/apiSession';
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager';

describe('OpenCodePermissionHandler', () => {
  let handler: OpenCodePermissionHandler;
  let mockSession: Partial<ApiSessionClient>;
  let mockRpcManager: Partial<RpcHandlerManager>;
  let mockUpdateAgentState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUpdateAgentState = vi.fn();

    mockRpcManager = {
      registerHandler: vi.fn((method, callback) => {
        // Store callback for testing
        (mockRpcManager as any).handlers = (mockRpcManager as any).handlers || {};
        (mockRpcManager as any).handlers[method] = callback;
      }),
    };

    mockSession = {
      rpcHandlerManager: mockRpcManager as RpcHandlerManager,
      updateAgentState: mockUpdateAgentState,
    };

    handler = new OpenCodePermissionHandler(mockSession as ApiSessionClient);
  });

  afterEach(() => {
    handler.reset();
  });

  describe('Default mode', () => {
    it('should create pending request and wait for mobile response', async () => {
      const toolCallId = 'call-1';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      // Create permission request (should not resolve until we trigger response)
      const permissionPromise = handler.handleToolCall(toolCallId, toolName, input);

      // Verify agent state was updated
      expect(mockUpdateAgentState).toHaveBeenCalled();
      const updateCall = mockUpdateAgentState.mock.calls[0][0];
      const updatedState = updateCall({});
      expect(updatedState.requests[toolCallId]).toBeDefined();
      expect(updatedState.requests[toolCallId].tool).toBe(toolName);
      expect(updatedState.requests[toolCallId].arguments).toEqual(input);

      // Verify request is pending
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockUpdateAgentState).toHaveBeenCalledTimes(1);

      // Simulate mobile approval response
      const permissionCallback = (mockRpcManager as any).handlers['permission'];
      await permissionCallback({
        id: toolCallId,
        approved: true,
        decision: 'approved',
      });

      // Verify promise resolves with approved decision
      const result = await permissionPromise;
      expect(result.decision).toBe('approved');

      // Verify agent state was updated to move to completed
      expect(mockUpdateAgentState).toHaveBeenCalledTimes(2);
      const secondUpdateCall = mockUpdateAgentState.mock.calls[1][0];
      const secondUpdatedState = secondUpdateCall(updatedState);
      expect(secondUpdatedState.completedRequests[toolCallId]).toBeDefined();
      expect(secondUpdatedState.completedRequests[toolCallId].status).toBe('approved');
    });

    it('should handle approval_for_session decision', async () => {
      const toolCallId = 'call-2';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      const permissionPromise = handler.handleToolCall(toolCallId, toolName, input);

      // Simulate mobile approval_for_session response
      const permissionCallback = (mockRpcManager as any).handlers['permission'];
      await permissionCallback({
        id: toolCallId,
        approved: true,
        decision: 'approved_for_session',
      });

      const result = await permissionPromise;
      expect(result.decision).toBe('approved_for_session');
    });

    it('should handle deny decision', async () => {
      const toolCallId = 'call-3';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      const permissionPromise = handler.handleToolCall(toolCallId, toolName, input);

      // Simulate mobile deny response
      const permissionCallback = (mockRpcManager as any).handlers['permission'];
      await permissionCallback({
        id: toolCallId,
        approved: false,
        decision: 'denied',
      });

      const result = await permissionPromise;
      expect(result.decision).toBe('denied');
    });

    it('should handle abort decision', async () => {
      const toolCallId = 'call-4';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      const permissionPromise = handler.handleToolCall(toolCallId, toolName, input);

      // Simulate mobile abort response
      const permissionCallback = (mockRpcManager as any).handlers['permission'];
      await permissionCallback({
        id: toolCallId,
        approved: false,
        decision: 'abort',
      });

      const result = await permissionPromise;
      expect(result.decision).toBe('abort');
    });

    it('should handle missing request (no pending request)', async () => {
      // Simulate response for non-existent request
      const permissionCallback = (mockRpcManager as any).handlers['permission'];
      await expect(permissionCallback({
        id: 'non-existent',
        approved: true,
      })).resolves.not.toThrow();
    });

    it('should timeout after 60 seconds', async () => {
      vi.useFakeTimers();

      const toolCallId = 'call-5';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      const permissionPromise = handler.handleToolCall(toolCallId, toolName, input);

      // Fast-forward 60 seconds
      vi.advanceTimersByTime(60000);

      // Verify promise resolves with denied decision
      const result = await permissionPromise;
      expect(result.decision).toBe('denied');

      vi.useRealTimers();
    });

    it('should handle agent state update error', async () => {
      const toolCallId = 'call-6';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      // Mock agent state update to throw error
      mockUpdateAgentState.mockImplementation(() => {
        throw new Error('State update failed');
      });

      await expect(
        handler.handleToolCall(toolCallId, toolName, input)
      ).rejects.toThrow('State update failed');
    });
  });

  describe('YOLO mode', () => {
    beforeEach(() => {
      handler.setPermissionMode('yolo');
    });

    it('should auto-approve all tool calls', async () => {
      const decision = await handler.handleToolCall('call-1', 'write-file', {});
      expect(decision.decision).toBe('approved');
    });

    it('should auto-approve write operations', async () => {
      const decision = await handler.handleToolCall('call-1', 'delete-file', {});
      expect(decision.decision).toBe('approved');
    });

    it('should not update agent state or send RPC requests', async () => {
      await handler.handleToolCall('call-1', 'write-file', {});
      
      // Should not have updated agent state
      expect(mockUpdateAgentState).not.toHaveBeenCalled();
    });
  });

  describe('Safe-YOLO mode', () => {
    beforeEach(() => {
      handler.setPermissionMode('safe-yolo');
    });

    it('should auto-approve all tool calls', async () => {
      const decision = await handler.handleToolCall('call-1', 'write-file', {});
      expect(decision.decision).toBe('approved');
    });
  });

  describe('Read-only mode', () => {
    beforeEach(() => {
      handler.setPermissionMode('read-only');
    });

    it('should allow read-only tools', async () => {
      const decision = await handler.handleToolCall('call-1', 'read-file', {});
      expect(decision.decision).toBe('approved');
    });

    it('should allow search-files tool', async () => {
      const decision = await handler.handleToolCall('call-2', 'search-files', {});
      expect(decision.decision).toBe('approved');
    });

    it('should allow list-files tool', async () => {
      const decision = await handler.handleToolCall('call-3', 'list-files', {});
      expect(decision.decision).toBe('approved');
    });

    it('should reject write operations', async () => {
      const decision = await handler.handleToolCall('call-4', 'write-file', {});
      expect(decision.decision).toBe('denied');
    });

    it('should reject delete operations', async () => {
      const decision = await handler.handleToolCall('call-5', 'delete-file', {});
      expect(decision.decision).toBe('denied');
    });

    it('should reject create operations', async () => {
      const decision = await handler.handleToolCall('call-6', 'create-file', {});
      expect(decision.decision).toBe('denied');
    });

    it('should reject edit operations', async () => {
      const decision = await handler.handleToolCall('call-7', 'edit-file', {});
      expect(decision.decision).toBe('denied');
    });

    it('should reject unknown tools (assume write operations)', async () => {
      const decision = await handler.handleToolCall('call-8', 'unknown-tool', {});
      expect(decision.decision).toBe('denied');
    });
  });

  describe('handlePermissionResponse', () => {
    it('should handle direct permission response', async () => {
      const toolCallId = 'call-1';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      const permissionPromise = handler.handleToolCall(toolCallId, toolName, input);

      // Directly call handlePermissionResponse
      handler.handlePermissionResponse(toolCallId, { decision: 'approved' });

      const result = await permissionPromise;
      expect(result.decision).toBe('approved');
    });

    it('should handle missing request in direct response', () => {
      expect(() => {
        handler.handlePermissionResponse('non-existent', { decision: 'approved' });
      }).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should clear pending requests', async () => {
      const toolCallId = 'call-1';
      const toolName = 'write-file';
      const input = { path: '/test/file.txt', content: 'hello' };

      const permissionPromise = handler.handleToolCall(toolCallId, toolName, input);

      // Reset before permission response
      handler.reset();

      // Promise should be rejected
      await expect(permissionPromise).rejects.toThrow('Permission handler reset');
    });

    it('should handle multiple pending requests', async () => {
      const promises = [
        handler.handleToolCall('call-1', 'write-file', {}),
        handler.handleToolCall('call-2', 'delete-file', {}),
        handler.handleToolCall('call-3', 'read-file', {}),
      ];

      // Reset all pending requests
      handler.reset();

      // All promises should be rejected
      await expect(promises[0]).rejects.toThrow('Permission handler reset');
      await expect(promises[1]).rejects.toThrow('Permission handler reset');
      await expect(promises[2]).rejects.toThrow('Permission handler reset');
    });
  });

  describe('setPermissionMode', () => {
    it('should update permission mode', () => {
      handler.setPermissionMode('yolo');
      expect(() => handler.setPermissionMode('read-only')).not.toThrow();
    });
  });
});
