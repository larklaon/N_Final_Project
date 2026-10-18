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
let waiters: (() => void)[] = [];
const wake = () => {
  const w = waiters;
  waiters = [];
  for (const f of w) f();
};
const nextChange = () => new Promise<void>((resolve) => waiters.push(resolve));

/** Test hook: forget any state left by a previous test. */
export function resetCoordinator() {
  running?.abort();
  running = null;
  chatHolds = 0;
  wake();
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
      fallback ??= setTimeout(finishIdle, IDLE_FALLBACK_MS);
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

async function acquire(priority: Priority, signal: AbortSignal) {
  for (;;) {
    if (signal.aborted) throw Error("plan_invalidated");
    if (priority !== "chat" && chatHolds > 0) {
      await nextChange();
      continue;
    }
    if (running) {
      if (rank[priority] > rank[running.priority]) {
        const r = running;
        r.abort();
        await r.idle;
        if (running === r) running = null;
        continue;
      }
      await nextChange();
      continue;
    }
    return;
  }
}

const free = (priority: Priority) => !running && (priority === "chat" || chatHolds === 0);

function start(priority: "plan" | "background", request: object, signal: AbortSignal, timeoutMs?: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort);
  if (signal.aborted) controller.abort();
  const { result, idle } = complete(request, controller.signal, timeoutMs);
  const entry: Running = { priority, abort, idle };
  running = entry;
  void idle.then(() => {
    if (running === entry) running = null;
    wake();
  });
  return result.finally(() => signal.removeEventListener("abort", abort));
}

/** Plan or background request through the shared slot; starts at once when the slot is free. */
export function runRequest(
  priority: "plan" | "background",
  request: object,
  signal: AbortSignal,
  timeoutMs?: number,
): Promise<string> {
  if (free(priority)) return start(priority, request, signal, timeoutMs);
  return acquire(priority, signal).then(() => start(priority, request, signal, timeoutMs));
}

/**
 * The learner sent a chat message: cancel lower-priority work, wait until the native side
 * is idle, and keep background work out until the returned release is called.
 */
export async function beginChat(): Promise<() => void> {
  chatHolds++;
  while (running && running.priority !== "chat") {
    const r = running;
    r.abort();
    await r.idle;
    if (running === r) running = null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    chatHolds = Math.max(0, chatHolds - 1);
    wake();
  };
}
