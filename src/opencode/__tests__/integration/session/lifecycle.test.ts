import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveSessionForDirectory, getLastSessionForDirectory, deleteSessionForDirectory } from '@/opencode/utils/sessionPersistence';
import type { OpenCodeSessionMetadata } from '@/opencode/types';

describe('Session Lifecycle', () => {
  const testDir = '/tmp/test-opencode-session';

  afterEach(async () => {
    await deleteSessionForDirectory(testDir);
  });

  it('should save and retrieve session', async () => {
    const session: OpenCodeSessionMetadata = {
      opencodeSessionId: 'test-session-123',
      directory: testDir,
      startedAt: Date.now(),
      model: 'claude-sonnet-4',
    };

    await saveSessionForDirectory(session);

    const retrieved = await getLastSessionForDirectory(testDir);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.opencodeSessionId).toBe(session.opencodeSessionId);
    expect(retrieved?.model).toBe(session.model);
  });

  it('should overwrite existing session', async () => {
    const session1: OpenCodeSessionMetadata = {
      opencodeSessionId: 'session-1',
      directory: testDir,
      startedAt: Date.now(),
      model: 'claude-sonnet-4',
    };

    const session2: OpenCodeSessionMetadata = {
      opencodeSessionId: 'session-2',
      directory: testDir,
      startedAt: Date.now() + 1000,
      model: 'gemini-2.5-pro',
    };

    await saveSessionForDirectory(session1);
    await saveSessionForDirectory(session2);

    const retrieved = await getLastSessionForDirectory(testDir);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.opencodeSessionId).toBe('session-2');
  });

  it('should return null for deleted session', async () => {
    await deleteSessionForDirectory(testDir);

    const result = await getLastSessionForDirectory(testDir);

    expect(result).toBeNull();
  });
});
