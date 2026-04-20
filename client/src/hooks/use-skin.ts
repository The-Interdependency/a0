// 33:0
import { useCallback, useEffect, useState } from "react";

export const SKINS = ["tensor", "synthwave", "copper"] as const;
export type Skin = (typeof SKINS)[number];

const KEY = "a0p_skin";

function readSkin(): Skin {
  try {
    const v = localStorage.getItem(KEY) as Skin | null;
    return v && SKINS.includes(v) ? v : "tensor";
  } catch {
    return "tensor";
  }
}

function applySkin(s: Skin) {
  const root = document.documentElement;
  SKINS.forEach((x) => root.classList.remove(`theme-${x}`));
  root.classList.add(`theme-${s}`);
}

export function useSkin() {
  const [skin, setSkinState] = useState<Skin>(readSkin);

  useEffect(() => {
    applySkin(skin);
  }, [skin]);

  const setSkin = useCallback((s: Skin) => {
    try { localStorage.setItem(KEY, s); } catch {}
    setSkinState(s);
  }, []);

  return { skin, setSkin };
}

export const SKIN_LABELS: Record<Skin, string> = {
  tensor: "Tensor Node",
  synthwave: "Synthwave Mesh",
  copper: "Copper Codex",
};
// 33:0
