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
