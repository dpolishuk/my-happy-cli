import { describe, it, expect, vi, afterEach } from 'vitest';

import { startDaemonControlServer } from '@/daemon/controlServer';
import type { TrackedSession } from '@/daemon/types';

describe('Daemon control server', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prunes stale sessions when listing', async () => {
    const stalePid = 99999;

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: any) => {
      // Only the liveness check uses signal 0.
      if (signal === 0 && pid === stalePid) {
        throw new Error('ESRCH');
      }
      return true as any;
    }) as any);

    const stopSessionCalls: string[] = [];

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
        stopSessionCalls.push(sessionId);
        return true;
      },
      spawnSession: async () => {
        return { type: 'error', errorMessage: 'not used' };
      },
      requestShutdown: () => {},
      onHappySessionWebhook: () => {},
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/list`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      expect(res.ok).toBe(true);
      const json = (await res.json()) as any;

      // Stale one should be removed from the response.
      expect(json.children).toEqual([
        {
          startedBy: 'daemon',
          happySessionId: 'live-session',
          pid: 1234,
        },
      ]);

      // And the control server should ask daemon to delete it from tracking.
      expect(stopSessionCalls).toContain(`PID-${stalePid}`);

      // Sanity: we did attempt liveness check.
      expect(killSpy).toHaveBeenCalled();
    } finally {
      await stop();
    }
  });
});
