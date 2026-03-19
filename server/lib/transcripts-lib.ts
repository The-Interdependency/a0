export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function extractMessagesFromFile(content: string, filename: string): string[] {
  const texts: string[] = [];
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".jsonl")) {
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          const text = obj.content || obj.text || obj.message || obj.body || "";
          if (typeof text === "string" && text.trim()) texts.push(text.trim());
        } catch {}
      }
      return texts;
    }
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.mapping) {
          for (const node of Object.values(item.mapping) as any[]) {
            const msg = node?.message;
            if (msg?.content?.parts) {
              const text = msg.content.parts.filter((p: any) => typeof p === "string").join(" ").trim();
              if (text) texts.push(text);
            }
          }
        } else if (typeof item.content === "string" && item.content.trim()) {
          texts.push(item.content.trim());
        } else if (typeof item.text === "string" && item.text.trim()) {
          texts.push(item.text.trim());
        }
      }
      return texts;
    }
    if (parsed.chat_messages) {
      for (const msg of parsed.chat_messages) {
        const text = msg.text || msg.content || "";
        if (typeof text === "string" && text.trim()) texts.push(text.trim());
      }
      return texts;
    }
    if (parsed.mapping) {
      for (const node of Object.values(parsed.mapping) as any[]) {
        const msg = (node as any)?.message;
        if (msg?.content?.parts) {
          const text = msg.content.parts.filter((p: any) => typeof p === "string").join(" ").trim();
          if (text) texts.push(text);
        }
      }
      return texts;
    }
    if (parsed.messages && Array.isArray(parsed.messages)) {
      for (const msg of parsed.messages) {
        const text = msg.content || msg.text || "";
        if (typeof text === "string" && text.trim()) texts.push(text.trim());
      }
      return texts;
    }
  } catch {}
  for (const para of content.split(/\n{2,}/)) {
    const trimmed = para.trim();
    if (trimmed.length > 20) texts.push(trimmed);
  }
  return texts;
}
