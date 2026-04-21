import { useEffect, useState } from "react";

// Shared primitive for scripted animation sequences (see /components/sequence).
// A sequence is a list of named steps with millisecond durations. The hook
// walks them in order, auto-advancing when each step's duration elapses, and
// optionally looping back to the start.

export type SequenceStep<K extends string> = {
  readonly id: K;
  readonly duration: number;
};

export type UseSequenceOptions = {
  loop?: boolean;
  paused?: boolean;
};

export type SequenceController<K extends string> = {
  id: K;
  index: number;
  isStep: (id: K) => boolean;
  isAtOrAfter: (id: K) => boolean;
  restart: () => void;
};

export const useSequence = <K extends string>(
  steps: readonly SequenceStep<K>[],
  options: UseSequenceOptions = {},
): SequenceController<K> => {
  const { loop = true, paused = false } = options;
  const [index, setIndex] = useState(0);

  const safeIndex = Math.min(index, Math.max(0, steps.length - 1));
  const current = steps[safeIndex];
  const duration = current?.duration ?? 0;

  useEffect(() => {
    if (paused) return;
    if (duration <= 0) return;
    const t = window.setTimeout(() => {
      setIndex((i) => {
        const next = i + 1;
        if (next >= steps.length) return loop ? 0 : i;
        return next;
      });
    }, duration);
    return () => window.clearTimeout(t);
  }, [safeIndex, duration, paused, loop, steps.length]);

  return {
    id: current?.id ?? steps[0]!.id,
    index: safeIndex,
    isStep: (id) => current?.id === id,
    isAtOrAfter: (id) => {
      const target = steps.findIndex((s) => s.id === id);
      return target >= 0 && safeIndex >= target;
    },
    restart: () => setIndex(0),
  };
};
