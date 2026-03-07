import { useState, useCallback } from "react";

const STORAGE_KEY = "a0p-slider-orientation";

type SliderOrientation = "vertical" | "horizontal";

export function useSliderOrientation() {
  const [orientation, setOrientation] = useState<SliderOrientation>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "horizontal" || stored === "vertical") return stored;
    } catch {}
    return "vertical";
  });

  const toggleOrientation = useCallback(() => {
    setOrientation((prev) => {
      const next = prev === "vertical" ? "horizontal" : "vertical";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  return {
    orientation,
    toggleOrientation,
    isVertical: orientation === "vertical",
  } as const;
}
