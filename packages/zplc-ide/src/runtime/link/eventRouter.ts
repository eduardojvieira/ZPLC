/**
 * @file eventRouter.ts
 * @brief One router for what a device reports (COM-025): events when the firmware pushes them, a labelled poll when
 *        it does not, a bounded queue and a count of what was lost.
 *
 * Studio had several timers that each asked the device for its state. A router owns the answer to "what is the
 * state of the device": the link feeds it events as they arrive; a firmware without events is polled, by one timer,
 * and the router says so (`source`, `label`) so the interface can show that the state is being polled and how often.
 * The queue between the link and the consumers is bounded: an event that does not fit costs the oldest one, and the
 * count of dropped events is part of what is shown.
 */

export type EventSource = 'events' | 'polling' | 'none';

export interface RouterStatus {
  readonly source: EventSource;
  /** What the interface shows next to the state: how it is known, and how often it is refreshed. */
  readonly label: string;
  readonly delivered: number;
  /** Events this side dropped because its queue was full. */
  readonly dropped: number;
  /** Events the device said it dropped (its queue was full). */
  readonly lostByDevice: number;
}

export interface RouterOptions {
  /** Events held for the consumers; the oldest is dropped past it (default 64). */
  readonly capacity?: number;
  /** Milliseconds between polls of a firmware without events (default 1000). */
  readonly pollIntervalMs?: number;
}

export class EventRouter<E> {
  private readonly handlers = new Set<(event: E) => void>();
  private readonly capacity: number;
  private readonly pollIntervalMs: number;
  private queue: E[] = [];
  private scheduled = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private source: EventSource = 'none';
  private delivered = 0;
  private dropped = 0;
  private lostByDevice = 0;

  constructor(options: RouterOptions = {}) {
    this.capacity = options.capacity ?? 64;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  subscribe(handler: (event: E) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** What the device pushes. */
  push(event: E): void {
    if (this.queue.length >= this.capacity) {
      this.queue.shift();
      this.dropped++;
    }
    this.queue.push(event);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => this.drain());
    }
  }

  /** The device told how many events it lost. */
  noteLostByDevice(count: number): void {
    this.lostByDevice += count;
  }

  /** The firmware pushes events: nothing is polled. */
  useEvents(): void {
    this.stopPolling();
    this.source = 'events';
  }

  /** The state is polled, by a timer that someone else owns: the router only says so. */
  usePollingLabel(): void {
    this.stopPolling();
    this.source = 'polling';
  }

  /** The firmware has no events: `poll` runs on one timer and what it returns goes to the consumers. */
  usePolling(poll: () => Promise<E | null>): void {
    this.stopPolling();
    this.source = 'polling';
    this.timer = setInterval(() => {
      void poll().then(
        (event) => {
          if (event !== null) this.push(event);
        },
        () => undefined,
      );
    }, this.pollIntervalMs);
  }

  /** Stop everything: no timer, nothing queued. */
  stop(): void {
    this.stopPolling();
    this.queue = [];
    this.source = 'none';
  }

  status(): RouterStatus {
    const label =
      this.source === 'events'
        ? 'state pushed by the device'
        : this.source === 'polling'
          ? `state polled every ${this.pollIntervalMs} ms: this firmware does not push events`
          : 'no device';
    return { source: this.source, label, delivered: this.delivered, dropped: this.dropped, lostByDevice: this.lostByDevice };
  }

  private stopPolling(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private drain(): void {
    this.scheduled = false;
    const batch = this.queue;
    this.queue = [];
    for (const event of batch) {
      this.delivered++;
      for (const handler of this.handlers) handler(event);
    }
  }
}
