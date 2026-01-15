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
