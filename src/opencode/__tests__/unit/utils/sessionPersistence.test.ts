import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveSessionForDirectory, getLastSessionForDirectory } from '@/opencode/utils/sessionPersistence';
import type { OpenCodeSessionMetadata } from '@/opencode/types';

describe('SessionPersistence', () => {
  const testDir = '/test/working/directory';

  afterEach(async () => {
    // Clean up test files
    // Implementation depends on storage method
  });

  it('should save session for directory', async () => {
    const session: OpenCodeSessionMetadata = {
      opencodeSessionId: 'session-123',
      directory: testDir,
      startedAt: Date.now(),
      model: 'claude-sonnet-4',
    };

    await saveSessionForDirectory(session);

    const retrieved = await getLastSessionForDirectory(testDir);
    expect(retrieved).toEqual(session);
  });

  it('should return null for non-existent directory', async () => {
    const result = await getLastSessionForDirectory('/non/existent');
    expect(result).toBeNull();
  });
});
