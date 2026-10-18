import { getSiwc, type AiEvent } from "../../../modules/siwc-android";

/**
 * One SIWC response at a time for the whole app (the native side allows one; its
 * response_busy refusal stays as the last guard). Priority: the learner's chat, then a
 * needed 7-day plan, then background personalization. A higher priority cancels a running
 * lower one by that request's own id and waits until the native side is idle again.
 */
export type Priority = "chat" | "plan" | "background";
const rank: Record<Priority, number> = { chat: 3, plan: 2, background: 1 };

type Running = { priority: Priority; abort: () => void; idle: Promise<void> };
let running: Running | null = null;
let chatHolds = 0;
type Queued = {
  priority: "plan" | "background";
  request: object;
  signal: AbortSignal;
  timeoutMs?: number;
  resolve: (text: string) => void;
  reject: (error: unknown) => void;
  removeAbort: () => void;
};
const queue: Queued[] = [];

/** Test hook: forget any state left by a previous test. */
export function resetCoordinator() {
  for (const item of queue.splice(0)) {
    item.removeAbort();
    item.reject(Error("plan_invalidated"));
  }
  running?.abort();
  running = null;
  chatHolds = 0;
}

/** How long to wait for the native "cancelled" event before treating the slot as free. */
const IDLE_FALLBACK_MS = 3000;

/**
 * Runs one Responses request and resolves with the completed text. `idle` settles when the
 * native side has finished with this request (terminal event, failed start, or fallback).
 * Late start promises are cancelled by their own id; other requests' events are ignored.
 */
export function complete(
  request: object,
  signal: AbortSignal,
  timeoutMs = 90_000,
): { result: Promise<string>; idle: Promise<void> } {
  const gateway = getSiwc();
  let markIdle!: () => void;
  const idle = new Promise<void>((resolve) => (markIdle = resolve));
  const result = new Promise<string>((resolve, reject) => {
    let requestId: string | null = null;
    let settled = false;
    let done = false;
    const early: AiEvent[] = [];
    let text = "";
    let fallback: ReturnType<typeof setTimeout> | null = null;
    const finishIdle = () => {
      if (done) return;
      done = true;
      if (fallback) clearTimeout(fallback);
      sub.remove();
      early.length = 0;
      markIdle();
    };
    const cancel = (id: string) => {
      void gateway.cancelResponse(id).catch(() => {});
      if (!done) fallback ??= setTimeout(finishIdle, IDLE_FALLBACK_MS);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      fn();
    };
    const abort = () => {
      finish(() => reject(Error("plan_invalidated")));
      if (requestId) cancel(requestId);
      else fallback ??= setTimeout(finishIdle, IDLE_FALLBACK_MS);
    };
    const handle = (e: AiEvent) => {
      if (done) return;
      if (requestId === null) return void early.push(e);
      if (e.requestId !== requestId) return;
      const terminal = e.type === "completed" || e.type === "failed" || e.type === "cancelled";
      if (!settled) {
        if (e.type === "delta") text += e.text ?? "";
        if (e.type === "completed") finish(() => resolve(e.text ?? text));
        if (e.type === "failed" || e.type === "cancelled") finish(() => reject(Error(e.code ?? e.type)));
      }
      if (terminal) finishIdle();
    };
    const sub = gateway.addListener("onResponse", handle);
    const timer = setTimeout(() => {
      finish(() => reject(Error("plan_timeout")));
      if (requestId) cancel(requestId);
      else fallback ??= setTimeout(finishIdle, IDLE_FALLBACK_MS);
    }, timeoutMs);
    signal.addEventListener("abort", abort);
    if (signal.aborted) {
      abort();
      finishIdle();
      return;
    }
    gateway.startResponse(JSON.stringify(request)).then(
      (r) => {
        requestId = r.requestId;
        // The native start promise can arrive after a reset, timeout or completion.
        if (settled) {
          cancel(requestId);
          for (const e of early.splice(0)) handle(e);
          return;
        }
        for (const e of early.splice(0)) handle(e);
      },
      (err) => {
        finish(() => reject(err));
        finishIdle();
      },
    );
  });
  return { result, idle };
}

/** Select and occupy the slot in the same synchronous turn; never wake every waiter. */
function drain() {
  if (chatHolds > 0 || queue.length === 0) return;
  if (running) {
    if (queue.some((q) => rank[q.priority] > rank[running!.priority])) running.abort();
    return;
  }
  let best = 0;
  for (let i = 1; i < queue.length; i++)
    if (rank[queue[i].priority] > rank[queue[best].priority]) best = i;
  const [item] = queue.splice(best, 1);
  item.removeAbort();
  if (item.signal.aborted) {
    item.reject(Error("plan_invalidated"));
    drain();
    return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  item.signal.addEventListener("abort", abort);
  if (item.signal.aborted) controller.abort();
  const { result, idle } = complete(item.request, controller.signal, item.timeoutMs);
  const entry: Running = { priority: item.priority, abort, idle };
  running = entry;
  void idle.then(() => {
    if (running === entry) running = null;
    drain();
  });
  void result.then(item.resolve, item.reject).finally(() => item.signal.removeEventListener("abort", abort));
}

/** A cancellable, priority-ordered queue for plan and personalization requests. */
export function runRequest(
  priority: "plan" | "background",
  request: object,
  signal: AbortSignal,
  timeoutMs?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Error("plan_invalidated"));
    const abort = () => {
      const index = queue.indexOf(item);
      if (index < 0) return;
      queue.splice(index, 1);
      item.removeAbort();
      reject(Error("plan_invalidated"));
    };
    const item: Queued = { priority, request, signal, timeoutMs, resolve, reject,
      removeAbort: () => signal.removeEventListener("abort", abort) };
    signal.addEventListener("abort", abort);
    queue.push(item);
    drain();
  });
}

/** The learner's chat preempts lower-priority work; its release resumes the queue. */
export async function beginChat(): Promise<() => void> {
  chatHolds++;
  while (running) {
    const entry = running;
    entry.abort();
    await entry.idle;
    if (running === entry) running = null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    chatHolds = Math.max(0, chatHolds - 1);
    drain();
  };
}
