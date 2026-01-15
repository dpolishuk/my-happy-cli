/**
 * Tool Result Formatter - Formats tool results for display
 *
 * Converts raw tool outputs into human-readable summaries
 * for mobile app and terminal display.
 */

import { logger } from '@/ui/logger';

export interface FormattedToolResult {
  /** Human-readable summary of result */
  summary: string;
  /** Original tool output preserved for debugging */
  raw: unknown;
}

/**
 * Format a tool result into a human-readable summary
 */
export function formatToolResult(toolName: string, result: unknown): FormattedToolResult {
  logger.debug(`[ToolResultFormatter] Formatting result for ${toolName}`);

  const summary = formatResult(result);

  return {
    summary,
    raw: result,
  };
}

/**
 * Format any result type into a summary string
 */
function formatResult(result: unknown): string {
  if (result === null || result === undefined) {
    return 'No output';
  }

  if (typeof result === 'string') {
    if (result.length === 0) return 'Empty string';
    if (result.length > 200) return `${result.substring(0, 200)}...`;
    return result;
  }

  if (typeof result === 'number' || typeof result === 'boolean') {
    return String(result);
  }

  if (Array.isArray(result)) {
    if (result.length === 0) return 'Empty array';

    const firstItem = result[0];
    if (typeof firstItem === 'object' && firstItem !== null) {
      const previewFields = ['name', 'path', 'content', 'title', 'message', 'file'];
      const previewField = previewFields.find(f => f in firstItem);
      if (previewField) {
        const preview = String((firstItem as Record<string, unknown>)[previewField]);
        return `${result.length} items (first: "${preview}${preview.length >= 50 ? '...' : ''}")`;
      }
    }
    return `${result.length} items`;
  }

  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return 'Empty object';

    if ('error' in obj) {
      const errorMsg = String(obj.error);
      return `Error: ${errorMsg.substring(0, 100)}`;
    }

    if ('success' in obj) {
      return obj.success ? 'Success' : 'Failed';
    }

    if (keys.length === 1) {
      const key = keys[0];
      const value = obj[key];
      const valueStr = typeof value === 'string' ? (value.length > 100 ? `${value.substring(0, 100)}...` : value) : String(value);
      return `${key}: ${valueStr}`;
    }

    const keyPreview = keys.slice(0, 3).join(', ');
    const suffix = keys.length > 3 ? '...' : '';
    return `Object with ${keys.length} fields: ${keyPreview}${suffix}`;
  }

  return 'Unknown result type';
}
