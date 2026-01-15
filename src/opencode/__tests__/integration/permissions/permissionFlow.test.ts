import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodePermissionHandler } from '@/opencode/utils/permissionHandler';
import type { PermissionMode } from '@/opencode/types';

describe('Permission Flow Integration', () => {
  let handler: OpenCodePermissionHandler | null = null;
  let mockApiClient: any;
  let registeredHandler: any = null;

  beforeEach(() => {
    // Capture the handler that gets registered
    registeredHandler = null;
    
    mockApiClient = {
      rpcHandlerManager: {
        registerHandler: vi.fn((_name: string, callback: any) => {
          registeredHandler = callback;
        }),
      },
      updateAgentState: vi.fn().mockResolvedValue(undefined),
    };

    handler = new OpenCodePermissionHandler(mockApiClient);
  });

  afterEach(() => {
    if (handler) {
      handler.reset();
    }
    handler = null;
    mockApiClient = null;
    registeredHandler = null;
  });

  it('should map yolo mode to allow_always', async () => {
    if (!handler) return;
    
    handler.setPermissionMode('yolo');
    const decision = await handler.handleToolCall('call-1', 'write-file', {});
    expect(decision.decision).toBe('approved');
  });

  it('should map read-only mode to reject for write operations', async () => {
    if (!handler) return;
    
    handler.setPermissionMode('read-only');
    const decision = await handler.handleToolCall('call-1', 'write-file', {});
    expect(decision.decision).toBe('denied');
  });

  it('should map safe-yolo mode to allow_always', async () => {
    if (!handler) return;
    
    handler.setPermissionMode('safe-yolo');
    const decision = await handler.handleToolCall('call-1', 'read-file', {});
    expect(decision.decision).toBe('approved');
  });

  it('should handle mobile permission responses', async () => {
    if (!handler) return;
    
    const decisionPromise = handler.handleToolCall('call-1', 'read-file', {});
    
    // Simulate RPC handler receiving mobile approval
    if (registeredHandler) {
      registeredHandler({
        id: 'call-1',
        approved: true,
        decision: 'approved_for_session' as const,
      });
    }
    
    const result = await decisionPromise;
    expect(result.decision).toBe('approved_for_session');
  });

  it('should handle mobile permission rejection', async () => {
    if (!handler) return;
    
    const decisionPromise = handler.handleToolCall('call-1', 'write-file', {});
    
    // Simulate RPC handler receiving mobile rejection
    if (registeredHandler) {
      registeredHandler({
        id: 'call-1',
        approved: false,
        decision: 'denied' as const,
      });
    }
    
    const result = await decisionPromise;
    expect(result.decision).toBe('denied');
  });
});
