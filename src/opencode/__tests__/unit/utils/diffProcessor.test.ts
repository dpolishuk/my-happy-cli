import { describe, it, expect } from 'vitest';
import { processAcpDiff } from '@/opencode/utils/diffProcessor';

describe('DiffProcessor', () => {
  it('should calculate line changes correctly', () => {
    const diff = {
      path: '/test/file.js',
      oldText: 'line1\nline2',
      newText: 'line1\nline2\nline3',
    };

    const result = processAcpDiff(diff);

    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(0);
    expect(result.summary).toContain('+1 line');
  });

  it('should handle new files', () => {
    const diff = {
      path: '/test/new.js',
      oldText: null,
      newText: 'new content',
    };

    const result = processAcpDiff(diff);

    expect(result.linesAdded).toBeGreaterThan(0);
    expect(result.isNewFile).toBe(true);
    expect(result.summary).toContain('new file');
  });
});