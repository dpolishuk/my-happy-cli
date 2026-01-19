import { describe, it, expect } from 'vitest';

import type { AgentBackend, AgentMessage, SessionId } from '@/agent/AgentBackend';
import type { UserMessage, Metadata } from '@/api/types';
import type { RawJSONLines } from '@/claude/types';
import { createOpenCodeRemoteController } from '@/opencode/runOpenCode';

class FakeSessionClient {
  private onUserMessageCallback: ((msg: UserMessage) => void) | null = null;

  public readonly sessionEvents: Array<{ type: string; [key: string]: unknown }> = [];
  public readonly sentClaudeMessages: RawJSONLines[] = [];
  public readonly sentCodexMessages: any[] = [];

  public readonly sessionId: string;

  public constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public readonly rpcHandlers = new Map<string, (...args: any[]) => any>();

  public rpcHandlerManager: { registerHandler: (name: string, handler: (...args: any[]) => any) => void } = {
    registerHandler: (name: string, handler: (...args: any[]) => any) => {
      this.rpcHandlers.set(name, handler);
    },
  };

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

  public sendCodexMessage(msg: any): void {
    this.sentCodexMessages.push(msg);
  }

  public sendSessionEvent(event: { type: string; [key: string]: unknown }): void {
    this.sessionEvents.push(event);
  }

  public keepAlive(): void {
    // no-op
  }

  public updateAgentState(): void {
    // no-op
  }

  public updateMetadata(): void {
    // no-op
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

  public async startSession(): Promise<{ sessionId: SessionId }> {
    return { sessionId: 'acp-test-session' };
  }

  public async sendPrompt(_sessionId: SessionId, _prompt: string): Promise<void> {
    this.handler?.({ type: 'status', status: 'running' });
    this.handler?.({ type: 'model-output', textDelta: 'ok' });
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

describe('OpenCode remote controller events', () => {
  it('emits ready + codex lifecycle events + union-safe session events', async () => {
    const fakeSession = new FakeSessionClient('happy-session-123');
    const backend = new FakeOpenCodeBackend();

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
      notifyDaemonSessionStarted: async () => ({}),
      createBackend: () => backend,
    });

    // The controller should emit an initial ready.
    expect(fakeSession.sessionEvents.some((e) => e.type === 'ready')).toBe(true);

    fakeSession.emitUserMessage('hi');
    await Promise.resolve();

    // Sanity: assistant text still flows.
    const assistantTexts = fakeSession.sentClaudeMessages
      .filter((m) => m.type === 'assistant')
      .flatMap((m) => {
        const content = (m as any).message?.content;
        if (!Array.isArray(content)) return [];
        return content.filter((c: any) => c?.type === 'text').map((c: any) => String(c.text));
      });

    expect(assistantTexts.join('\n')).toContain('ok');

    // Events should be sent via sendCodexMessage (content.type='codex').
    const hasTaskStarted = fakeSession.sentCodexMessages.some((m: any) => m?.type === 'task_started');
    const hasTaskComplete = fakeSession.sentCodexMessages.some((m: any) => m?.type === 'task_complete');

    expect(hasTaskStarted).toBe(true);
    expect(hasTaskComplete).toBe(true);

    // And we should emit union-safe session events for the event pipeline.
    // (Happy UI event schema only supports: switch/message/limit-reached/ready)
    const hasEventTaskStartedMessage = fakeSession.sessionEvents.some(
      (e) => e.type === 'message' && (e as any).message === 'Task started'
    );

    expect(hasEventTaskStartedMessage).toBe(true);

    await controller.dispose();
  });
});
