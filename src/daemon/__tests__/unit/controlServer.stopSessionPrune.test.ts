import { describe, it, expect, vi, afterEach } from 'vitest';

import { startDaemonControlServer } from '@/daemon/controlServer';
import type { TrackedSession } from '@/daemon/types';

describe('Daemon control server stop-session pruning', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prunes stale sessions when stopping another session', async () => {
    const stalePid = 99999;

    vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: any) => {
      if (signal === 0 && pid === stalePid) {
        throw new Error('ESRCH');
      }
      return true as any;
    }) as any);

    const stopCalls: string[] = [];

    const sessions: TrackedSession[] = [
      {
        startedBy: 'daemon',
        pid: 1234,
        happySessionId: 'live-session',
      },
      {
        startedBy: 'daemon',
        pid: stalePid,
        happySessionId: 'stale-session',
      },
    ];

    const { port, stop } = await startDaemonControlServer({
      getChildren: () => sessions,
      stopSession: (sessionId: string) => {
        stopCalls.push(sessionId);
        return sessionId !== 'never';
      },
      spawnSession: async () => {
        return { type: 'error', errorMessage: 'not used' };
      },
      requestShutdown: () => {},
      onHappySessionWebhook: () => {},
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/stop-session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'live-session' }),
      });

      expect(res.ok).toBe(true);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);

      // Stale should be cleaned up as part of this stop call.
      expect(stopCalls).toContain(`PID-${stalePid}`);
      // And then we should have attempted to stop the requested session.
      expect(stopCalls).toContain('live-session');
    } finally {
      await stop();
    }
  });
});
