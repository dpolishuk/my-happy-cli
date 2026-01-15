/**
 * Options Parser for OpenCode - Parses response options
 *
 * Parses XML-formatted options from agent responses
 * for display in mobile app and handling user choices.
 */

import { logger } from '@/ui/logger';

export interface ParsedOption {
  id: string;
  name: string;
  description?: string;
}

/**
 * Parse options from text content
 *
 * Looks for XML-like format: <options><option id="x">Name</option></options>
 */
export function parseOptionsFromText(text: string): ParsedOption[] | null {
  const optionsRegex = /<options>([\s\S]*?)<\/options>/;
  const match = text.match(optionsRegex);

  if (!match) {
    return null;
  }

  const optionsContent = match[1];
  const optionRegex = /<option id="([^"]+)">([^<]+)<\/option>/g;
  const options: ParsedOption[] = [];
  let optionMatch;

  while ((optionMatch = optionRegex.exec(optionsContent)) !== null) {
    options.push({
      id: optionMatch[1],
      name: optionMatch[2].trim(),
    });
  }

  logger.debug(`[OptionsParser] Parsed ${options.length} options from text`);
  return options;
}

/**
 * Check if options block is incomplete
 */
export function hasIncompleteOptions(text: string): boolean {
  const hasOpeningTag = /<options>/.test(text);
  const hasClosingTag = /<\/options>/.test(text);

  return hasOpeningTag && !hasClosingTag;
}

/**
 * Format options as XML string
 */
export function formatOptionsXml(options: ParsedOption[]): string {
  const optionsXml = options
    .map(opt => `<option id="${opt.id}">${opt.name}</option>`)
    .join('\n');

  return `<options>\n${optionsXml}\n</options>`;
}
