import { describe, it, expect } from 'vitest';
import { formatToolResult } from '@/opencode/utils/toolResultFormatter';

describe('ToolResultFormatter', () => {
  it('should format file read results', () => {
    const result = { content: 'file content' };
    const formatted = formatToolResult('read-file', result);

    expect(formatted.summary).toContain('file');
    expect(formatted.summary.length).toBeGreaterThan(0);
  });

  it('should format array results', () => {
    const result = [{ name: 'file1' }, { name: 'file2' }];
    const formatted = formatToolResult('list-files', result);

    expect(formatted.summary).toContain('2 items');
    expect(formatted.raw).toEqual(result);
  });

  it('should format error results', () => {
    const result = { error: 'File not found' };
    const formatted = formatToolResult('read-file', result);

    expect(formatted.summary).toContain('Error');
    expect(formatted.summary.length).toBeGreaterThan(0);
  });
});
