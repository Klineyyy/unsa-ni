"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VisionState =
  | { status: "idle" }
  | { status: "loading"; progress: number }
  | { status: "ready" }
  | { status: "error"; message: string };

type Pending = { resolve: (v: number[]) => void; reject: (e: Error) => void };

/** The image model, in a Web Worker. It downloads on first use, so nobody pays for it just by opening the page. */
export function useVision() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);
  const [state, setState] = useState<VisionState>({ status: "idle" });

  const failAll = useCallback((message: string) => {
    pending.current.forEach((p) => p.reject(new Error(message)));
    pending.current.clear();
  }, []);

  const start = useCallback(() => {
    if (worker.current) return;
    setState({ status: "loading", progress: 0 });
    const w = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;

    const die = (message: string) => {
      setState({ status: "error", message });
      failAll(message);
      w.terminate();
      worker.current = null;
    };

    w.onmessage = (event: MessageEvent) => {
      const m = event.data;
      if (m.type === "progress") setState({ status: "loading", progress: m.total ? Math.min(1, m.loaded / m.total) : 0 });
      else if (m.type === "ready") setState({ status: "ready" });
      else if (m.type === "embedded") {
        pending.current.get(m.id)?.resolve(m.vector);
        pending.current.delete(m.id);
      } else if (m.type === "error") {
        if (m.id !== undefined) {
          pending.current.get(m.id)?.reject(new Error(m.message));
          pending.current.delete(m.id);
        } else die(m.message);
      }
    };
    w.onerror = () => die("The image model crashed.");
    w.postMessage({ type: "init" });
  }, [failAll]);

  /** A unit-length vector describing the photo. */
  const embed = useCallback(
    (blob: Blob) => {
      start();
      return new Promise<number[]>((resolve, reject) => {
        const id = nextId.current++;
        pending.current.set(id, { resolve, reject });
        if (!worker.current) return reject(new Error("The image model is not available."));
        worker.current.postMessage({ type: "embed", id, blob });
      });
    },
    [start],
  );

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  return { state, embed };
}
