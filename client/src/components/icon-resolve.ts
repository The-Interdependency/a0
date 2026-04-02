import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

const cache = new Map<string, LucideIcon | null>();

export function resolveIcon(name: string): LucideIcon | null {
  if (cache.has(name)) return cache.get(name)!;
  const icon = (LucideIcons as Record<string, unknown>)[name] as LucideIcon | undefined;
  const resolved = icon ?? null;
  cache.set(name, resolved);
  return resolved;
}
