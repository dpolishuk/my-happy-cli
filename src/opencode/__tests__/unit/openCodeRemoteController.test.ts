import { describe, it, expect } from 'vitest';

import type { AgentBackend, AgentMessage, SessionId } from '@/agent/AgentBackend';
import type { UserMessage, Metadata } from '@/api/types';
import type { RawJSONLines } from '@/claude/types';

function getAssistantTexts(msg: any): string[] {
  const content = msg?.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((c: any) => c?.type === 'text').map((c: any) => String(c.text));
}
import { createOpenCodeRemoteController } from '@/opencode/runOpenCode';

class FakeSessionClient {
  private onUserMessageCallback: ((msg: UserMessage) => void) | null = null;
  public readonly sentClaudeMessages: RawJSONLines[] = [];
  public readonly sessionEvents: Array<{ type: string; [key: string]: unknown }> = [];

  public readonly sessionId: string;

  public constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public onUserMessage(callback: (msg: UserMessage) => void): void {
    this.onUserMessageCallback = callback;
  }

  public emitUserMessage(text: string): void {
    if (!this.onUserMessageCallback) {
      throw new Error('No onUserMessage handler registered');
    }

    this.onUserMessageCallback({
      role: 'user',
      content: { type: 'text', text },
    });
  }

  public sendClaudeSessionMessage(msg: RawJSONLines): void {
    this.sentClaudeMessages.push(msg);
  }

  public sendSessionEvent(event: { type: string; [key: string]: unknown }): void {
    this.sessionEvents.push(event);
  }

  public rpcHandlerManager: { registerHandler: (name: string, handler: (...args: any[]) => any) => void } = {
    registerHandler: () => {
      // no-op for tests
    },
  };

  public sendCodexMessage(_msg: any): void {
    // present so sendAssistantDelta is not used as a fallback for codex events
  }


  public keepAlive(): void {
    // no-op for tests
  }

  public updateAgentState(): void {
    // no-op for tests
  }

  public updateMetadata(): void {
    // no-op for tests
  }

  public flush(): Promise<void> {
    return Promise.resolve();
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeOpenCodeBackend implements AgentBackend {
  private handler: ((msg: AgentMessage) => void) | null = null;
  public readonly prompts: string[] = [];

  public async startSession(): Promise<{ sessionId: SessionId }> {
    return { sessionId: 'acp-test-session' };
  }

  public async sendPrompt(_sessionId: SessionId, prompt: string): Promise<void> {
    this.prompts.push(prompt);

    // Minimal stream: running -> delta -> tool-call -> tool-result -> delta -> idle
    this.handler?.({ type: 'status', status: 'running' });
    this.handler?.({ type: 'model-output', textDelta: 'Hello' });
    this.handler?.({ type: 'tool-call', toolName: 'read_file', arguments: { path: '/tmp/foo.txt' }, toolCallId: 'call-1' } as any);
    this.handler?.({ type: 'tool-result', toolName: 'read_file', result: { content: 'x'.repeat(1200) } } as any);
    this.handler?.({ type: 'model-output', textDelta: ' from OpenCode.' });
    this.handler?.({ type: 'status', status: 'idle' });
  }

  public async cancel(): Promise<void> {
    // no-op
  }

  public onMessage(handler: (msg: AgentMessage) => void): void {
    this.handler = handler;
  }

  public async dispose(): Promise<void> {
    // no-op
  }
}

describe('OpenCode remote controller', () => {
  it('reports session to daemon and streams assistant text with uuid/parentUuid chaining', async () => {
    const fakeSession = new FakeSessionClient('happy-session-123');
    const backend = new FakeOpenCodeBackend();

    const reported: Array<{ sessionId: string; metadata: Metadata }> = [];

    const metadata: Metadata = {
      path: '/tmp',
      host: 'test-host',
      homeDir: '/tmp',
      happyHomeDir: '/tmp',
      happyLibDir: '/tmp',
      happyToolsDir: '/tmp',
      machineId: 'test-machine',
      startedBy: 'terminal',
      flavor: 'opencode',
    };

    const controller = await createOpenCodeRemoteController({
      sessionClient: fakeSession as any,
      metadata,
      notifyDaemonSessionStarted: async (sessionId: string, md: Metadata) => {
        reported.push({ sessionId, metadata: md });
        return {};
      },
      createBackend: () => backend,
    });

    // Send a user message through the fake session.
    fakeSession.emitUserMessage('hi');

    // Wait one microtask for async handlers.
    await Promise.resolve();

    expect(reported).toHaveLength(1);
    expect(reported[0]?.sessionId).toBe('happy-session-123');

    expect(backend.prompts).toEqual(['hi']);

    // We expect at least one assistant message with the streamed delta.
    const assistantMessages = fakeSession.sentClaudeMessages.filter((m) => m.type === 'assistant');

    // Happy UI requires assistant messages to include message.model
    expect(assistantMessages.length).toBeGreaterThan(0);
    for (const m of assistantMessages) {
      expect((m as any).message?.model).toBeTypeOf('string');
      expect(((m as any).message?.model as string).length).toBeGreaterThan(0);
    }

    // Expect delta stream + label messages all to share one linear uuid chain.
    // We expect at least 2 deltas, plus at least one label from tool-call/tool-result once implemented.
    expect(assistantMessages.length).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < assistantMessages.length; i++) {
      const msg = assistantMessages[i] as any;

      if (i === 0) {
        expect(msg.parentUuid ?? null).toBeNull();
      } else {
        const prev = assistantMessages[i - 1] as any;
        expect(msg.parentUuid).toBe(prev.uuid);
      }
    }

    const assistantTexts = assistantMessages.flatMap((m) => getAssistantTexts(m as any));

    expect(assistantTexts.join('')).toContain('Hello');
    expect(assistantTexts.join('')).toContain(' from OpenCode.');

    // Status + tool events should be mapped to assistant text labels.
    // NOTE: This must work even when sendCodexMessage exists (so we check the human label text).
    expect(assistantTexts.join('\n')).toContain('Task started');
    expect(assistantTexts.join('\n')).toContain('Task complete');

    expect(assistantTexts.join('\n')).toContain('Tool call: read_file');
    expect(assistantTexts.join('\n')).toContain('Tool result: read_file');

    // Tool result should be truncated for UI.
    const toolResultLine = assistantTexts.find((t) => t.startsWith('Tool result: read_file')) ?? '';
    const summary = toolResultLine.split(' — ')[1] ?? '';
    expect(summary.length).toBeLessThanOrEqual(1003);
    expect(summary.endsWith('...')).toBe(true);

    await controller.dispose();
  });
});
