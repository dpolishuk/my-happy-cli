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
