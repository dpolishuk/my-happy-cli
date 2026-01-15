/**
 * Diff Processor for OpenCode - Formats ACP diffs for display
 *
 * Processes ACP diff format (oldText/newText) to generate
 * human-readable summaries for mobile and terminal display.
 */

import { logger } from '@/ui/logger';

export interface AcpDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export interface ProcessedDiff {
  path: string;
  isNewFile: boolean;
  isDeletedFile: boolean;
  linesAdded: number;
  linesRemoved: number;
  summary: string;
  preview?: string;
}

/**
 * Process an ACP diff and generate a summary
 */
export function processAcpDiff(diff: AcpDiff): ProcessedDiff {
  const { path, oldText, newText } = diff;

  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText.split('\n');

  const linesAdded = Math.max(0, newLines.length - oldLines.length);
  const linesRemoved = Math.max(0, oldLines.length - newLines.length);

  const isNewFile = oldText === null;
  const isDeletedFile = newText === null;

  let summary: string;

  if (isNewFile) {
    summary = `Created new file: ${path}`;
  } else if (isDeletedFile) {
    summary = `Deleted file: ${path}`;
  } else {
    summary = `Modified ${path}`;
    if (linesAdded > 0 || linesRemoved > 0) {
      const parts = [];
      if (linesAdded > 0) parts.push(`+${linesAdded}`);
      if (linesRemoved > 0) parts.push(`-${linesRemoved}`);
      summary += ` (${parts.join(', ')} lines)`;
    }
  }

  const preview = newText?.substring(0, 100);

  logger.debug(`[DiffProcessor] Processed diff: ${summary}`);

  return {
    path,
    isNewFile,
    isDeletedFile,
    linesAdded,
    linesRemoved,
    summary,
    preview,
  };
}

/**
 * Generate a human-readable diff summary for mobile display
 */
export function formatDiffForMobile(diff: ProcessedDiff): string {
  let output = diff.summary;

  if (diff.preview) {
    output += `\n\nPreview:\n${diff.preview}${diff.preview.length >= 100 ? '...' : ''}`;
  }

  return output;
}