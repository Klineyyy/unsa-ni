"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classify, type Probe, type Verdict } from "@/lib/classify";
import { dishById, dishes } from "@/lib/dishes";
import { samples } from "@/lib/samples";
import { useVision } from "@/lib/useVision";
import DishInfo from "./DishInfo";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; url: string }
  | { kind: "done"; url: string; verdict: Verdict }
  | { kind: "error"; message: string; url?: string };

const pct = (p: number) => `${Math.round(p * 100)}%`;

export default function Lens() {
  const { state: vision, embed } = useVision();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const probe = useRef<Promise<Probe> | null>(null);
  const objectUrl = useRef<string | null>(null);
  const results = useRef<HTMLDivElement>(null);

  const analyse = useCallback(
    async (blob: Blob, url: string) => {
      setSelected(null);
      setPhase({ kind: "working", url });
      try {
        probe.current ??= fetch("/model/probe.json").then((r) => {
          if (!r.ok) throw new Error("The model file could not be loaded.");
          return r.json() as Promise<Probe>;
        });
        const [p, vector] = await Promise.all([probe.current, embed(blob)]);
        const verdict = classify(vector, p);
        setPhase({ kind: "done", url, verdict });
        if (verdict.kind === "answered") setSelected(verdict.guesses[0].id);
        results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        probe.current = null;
        const text = String(error instanceof Error ? error.message : error);
        setPhase({
          kind: "error",
          url,
          message: /decode|image|format/i.test(text)
            ? "I couldn't read that file as a photo. Try a JPEG or PNG."
            : !navigator.onLine
              ? "You're offline, and the AI hasn't been downloaded yet. Connect once and it will work offline from then on."
              : "Something went wrong while looking at the photo. Please try again.",
        });
      }
    },
    [embed],
  );

  const handleFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setPhase({ kind: "error", message: "That isn't an image. Choose a photo of a dish." });
        return;
      }
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(file);
      void analyse(file, objectUrl.current);
    },
    [analyse],
  );

  const handleSample = async (file: string) => {
    try {
      const response = await fetch(`/samples/${file}`);
      if (!response.ok) throw new Error(String(response.status));
      void analyse(await response.blob(), `/samples/${file}`);
    } catch {
      setPhase({ kind: "error", message: "I couldn't load that sample photo. Check your connection, or choose a photo of your own." });
    }
  };

  // paste a photo from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => handleFile(Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/")));
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  useEffect(() => () => void (objectUrl.current && URL.revokeObjectURL(objectUrl.current)), []);

  const shown = selected ? dishById.get(selected) : undefined;
  const busy = phase.kind === "working";
  // once the AI has loaded and the service worker is in charge, the app keeps working with no connection
  const offlineReady = vision.status === "ready" && typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
  const status = useMemo(() => {
    if (vision.status === "loading") return `Waking up the AI… ${Math.round(vision.progress * 100)}% (first photo only, about 85 MB)`;
    if (busy) return "Looking at your photo…";
    return "";
  }, [vision, busy]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <header className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-chili">Filipino food, from a photo</p>
        <h1 className="font-display text-6xl font-extrabold leading-none sm:text-7xl">
          Unsa <span className="text-chili">ni?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted">
          Show it a photo of a Filipino dish and the AI tells you what it is, in your browser. Your photo never leaves your device.
        </p>
      </header>

      <section
        aria-label="Choose a photo"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`mt-8 rounded-3xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-chili bg-sun/20" : "border-line bg-card"}`}
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <label className="cursor-pointer rounded-full bg-chili px-6 py-3 font-bold text-white shadow transition hover:brightness-110 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ink">
            📷 Take a photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
          <label className="cursor-pointer rounded-full border-2 border-leaf px-6 py-3 font-bold text-leaf-dark transition hover:bg-leaf hover:text-white focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ink">
            🖼️ Choose a photo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>
        <p className="mt-3 text-sm text-muted">or drop a photo here, or paste one</p>

        <div className="mt-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">No photo handy? Try one</p>
          <ul className="flex flex-wrap justify-center gap-2">
            {samples.map((s) => (
              <li key={s.file}>
                <button
                  type="button"
                  onClick={() => void handleSample(s.file)}
                  disabled={busy}
                  className="block h-16 w-16 overflow-hidden rounded-xl ring-2 ring-line transition hover:ring-chili disabled:opacity-50 sm:h-20 sm:w-20"
                  aria-label={`Try a photo of ${s.truth}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small local sample photos */}
                  <img src={`/samples/${s.file}`} alt="" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div aria-live="polite" className="mt-4 min-h-6 text-center text-sm text-muted">
        {status || (offlineReady && <span className="font-semibold text-leaf-dark">✓ The AI is on this device, so it works offline too</span>)}
      </div>

      <div ref={results} className="scroll-mt-4">
        {phase.kind !== "idle" && (
          <section aria-label="Result" className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,15rem)_1fr]">
            {"url" in phase && phase.url && (
              <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- the photo the visitor chose */}
                <img src={phase.url} alt="The photo you chose" className="aspect-square w-full object-cover" />
              </div>
            )}
            <div>
              {phase.kind === "working" && <p className="text-lg font-semibold">Looking…</p>}
              {phase.kind === "error" && (
                <p role="alert" className="rounded-xl border border-chili/40 bg-chili/10 p-4">
                  {phase.message}
                </p>
              )}
              {phase.kind === "done" && <Answer verdict={phase.verdict} selected={selected} onSelect={setSelected} />}
            </div>
          </section>
        )}
      </div>

      {shown && (
        <div className="mt-5">
          <DishInfo dish={shown} />
        </div>
      )}

      <section aria-label="What it knows" className="mt-12">
        <h2 className="font-display text-2xl font-extrabold">The {dishes.length} dishes it knows</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {dishes.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setSelected(d.id)}
                aria-pressed={selected === d.id}
                className={`rounded-full border px-3 py-1 text-sm transition ${selected === d.id ? "border-leaf bg-leaf text-white" : "border-line bg-card hover:border-leaf"}`}
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Anything else, and it will say so, or say it is not sure.</p>
      </section>

      <footer className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-muted">
        <p>
          The AI (CLIP, plus a small classifier I trained on freely licensed photos from Wikimedia Commons) runs in your browser. It works out what is in the
          photo on your device, and nothing is uploaded. It gets it wrong sometimes: across my test photos, when it names a dish it is right about 3 times in
          4.
        </p>
        <p className="mt-2">
          Sample photos are from Wikimedia Commons:{" "}
          {samples.map((s, i) => (
            <span key={s.file}>
              <a className="underline hover:text-chili" href={s.page} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>{" "}
              by {s.credit} ({s.license}){i < samples.length - 1 ? "; " : "."}
            </span>
          ))}
        </p>
      </footer>
    </div>
  );
}

function Answer({ verdict, selected, onSelect }: { verdict: Verdict; selected: string | null; onSelect: (id: string) => void }) {
  const guesses = verdict.guesses.map((g) => ({ ...g, dish: dishById.get(g.id) })).filter((g) => g.dish);
  const top = guesses[0];
  // a runner-up at 0% is noise, not an alternative
  const alternatives = guesses.slice(1).filter((g) => g.p >= 0.05);

  if (verdict.kind === "answered" && top?.dish) {
    return (
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-leaf">It looks like</p>
        <p className="font-display text-5xl font-extrabold leading-none">{top.dish.name}</p>
        <Bar p={top.p} />
        {alternatives.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Also possible:{" "}
            {alternatives.map((g, i) => (
              <span key={g.id}>
                <button type="button" onClick={() => onSelect(g.id)} className={`underline hover:text-chili ${selected === g.id ? "font-bold text-ink" : ""}`}>
                  {g.dish!.name}
                </button>{" "}
                {pct(g.p)}
                {i < alternatives.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        )}
      </div>
    );
  }

  if (verdict.kind === "unsure") {
    return (
      <div>
        <p className="font-display text-3xl font-extrabold leading-tight">I&apos;m not sure.</p>
        <p className="mt-1 text-muted">These are my best guesses. Tap one to read about it.</p>
        <Guesses guesses={guesses} selected={selected} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <div>
      <p className="font-display text-3xl font-extrabold leading-tight">That doesn&apos;t look like a Filipino dish.</p>
      <p className="mt-1 text-muted">It might be another kind of food, or not food at all. If it is one of mine, it would most likely be:</p>
      <Guesses guesses={guesses} selected={selected} onSelect={onSelect} />
    </div>
  );
}

function Guesses({ guesses, selected, onSelect }: { guesses: { id: string; p: number; dish?: { name: string } }[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ol className="mt-3 grid gap-2">
      {guesses.map((g) => (
        <li key={g.id}>
          <button
            type="button"
            onClick={() => onSelect(g.id)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${selected === g.id ? "border-leaf bg-leaf/10" : "border-line bg-card hover:border-leaf"}`}
          >
            <span className="font-semibold">{g.dish?.name}</span>
            <span className="ml-auto text-sm text-muted">{pct(g.p)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Bar({ p }: { p: number }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct(p)} sure`}>
        <div className="h-full rounded-full bg-leaf" style={{ width: pct(p) }} />
      </div>
      <span className="text-sm font-semibold">{pct(p)} sure</span>
    </div>
  );
}
