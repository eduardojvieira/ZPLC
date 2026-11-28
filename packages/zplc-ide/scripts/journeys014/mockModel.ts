/**
 * A scripted OpenAI-compatible model for the automated Journey 4 (JRN-005). It listens on a loopback port of the machine
 * running the journey, answers every chat completion from a script given by the journey and records what it received, so
 * the journey can assert the exact request the Assistant sent. It is no model: nothing leaves the machine and no key exists.
 */

export interface MockRequest {
  method: string;
  path: string;
  /** The header names received, lower-cased. */
  headerNames: string[];
  authorization: string | null;
  /** The raw body, to scan it for what must never be in it. */
  raw: string;
  body: Record<string, unknown>;
}

/** The text a reply carries in `choices[0].message.content`. */
export type MockReply = string | { status: number };

export interface MockModel {
  /** `http://127.0.0.1:<port>`, the endpoint the journey types into Preferences. */
  readonly endpoint: string;
  /** Every request received, in order, the connection test's probe included. */
  readonly requests: MockRequest[];
  /** The requests that carried a project (no `ping` probe). */
  chatRequests(): MockRequest[];
  /** The next scripted reply, used by the next request that is not a probe. */
  enqueue(...replies: Array<MockReply | ((request: MockRequest) => MockReply)>): void;
  stop(): void;
}

const completion = (content: string) => ({
  id: 'chatcmpl-mock',
  object: 'chat.completion',
  model: 'mock-plc-1',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
});

export const isProbe = (request: MockRequest): boolean => request.body.max_tokens === 1;

export function startMockModel(): MockModel {
  const requests: MockRequest[] = [];
  const queue: Array<MockReply | ((request: MockRequest) => MockReply)> = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const raw = await req.text();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        /* a body that is not JSON is recorded as empty and answered 400 */
      }
      const received: MockRequest = {
        method: req.method,
        path: new URL(req.url).pathname,
        headerNames: [...req.headers.keys()].map((name) => name.toLowerCase()),
        authorization: req.headers.get('authorization'),
        raw,
        body,
      };
      requests.push(received);
      if (received.method !== 'POST' || received.path !== '/v1/chat/completions') return new Response('not found', { status: 404 });
      if (isProbe(received)) return Response.json(completion('pong'));
      const next = queue.shift();
      if (next === undefined) return new Response('no scripted reply left', { status: 500 });
      const reply = typeof next === 'function' ? next(received) : next;
      return typeof reply === 'string' ? Response.json(completion(reply)) : new Response('scripted failure', { status: reply.status });
    },
  });
  return {
    endpoint: `http://127.0.0.1:${server.port}`,
    requests,
    chatRequests: () => requests.filter((request) => !isProbe(request)),
    enqueue: (...replies) => void queue.push(...replies),
    stop: () => void server.stop(true),
  };
}
