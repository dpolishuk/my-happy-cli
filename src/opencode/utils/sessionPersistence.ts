/**
 * Session Persistence for OpenCode
 *
 * Saves and retrieves OpenCode session metadata for resumption.
 * Uses local storage indexed by working directory hash.
 */

import { join } from 'path';
import { homedir } from 'os';
import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { createHash } from 'crypto';
import { logger } from '@/ui/logger';
import type { OpenCodeSessionMetadata } from '../types';

/**
 * Directory for storing session metadata
 */
const SESSION_DIR = join(homedir(), '.happy-dev', 'opencode', 'sessions');

/**
 * Hash a directory path to create a safe filename
 */
function hashDirectory(dir: string): string {
  return createHash('sha256').update(dir).digest('hex').substring(0, 16);
}

/**
 * Get the session file path for a directory
 */
function getSessionFilePath(dir: string): string {
  const hash = hashDirectory(dir);
  return join(SESSION_DIR, `${hash}.json`);
}

/**
 * Save session metadata for a directory
 */
export async function saveSessionForDirectory(session: OpenCodeSessionMetadata): Promise<void> {
  try {
    // Ensure session directory exists
    await mkdir(SESSION_DIR, { recursive: true });

    const filePath = getSessionFilePath(session.directory);
    const data = JSON.stringify(session, null, 2);

    await writeFile(filePath, data, 'utf-8');

    logger.debug(`[SessionPersistence] Saved session for ${session.directory}: ${session.opencodeSessionId}`);
  } catch (error) {
    logger.warn('[SessionPersistence] Failed to save session:', error);
  }
}

/**
 * Get last session for a directory
 */
export async function getLastSessionForDirectory(dir: string): Promise<OpenCodeSessionMetadata | null> {
  try {
    const filePath = getSessionFilePath(dir);
    const data = await readFile(filePath, 'utf-8');

    const session: OpenCodeSessionMetadata = JSON.parse(data);

    logger.debug(`[SessionPersistence] Retrieved session for ${dir}: ${session.opencodeSessionId}`);

    return session;
  } catch (error) {
    logger.debug(`[SessionPersistence] No session found for ${dir}`);
    return null;
  }
}

/**
 * Delete session metadata for a directory
 */
export async function deleteSessionForDirectory(dir: string): Promise<void> {
  try {
    const filePath = getSessionFilePath(dir);
    await unlink(filePath);

    logger.debug(`[SessionPersistence] Deleted session for ${dir}`);
  } catch (error) {
    logger.debug(`[SessionPersistence] No session to delete for ${dir}`);
  }
}
