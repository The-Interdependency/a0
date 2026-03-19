export async function executeCustomToolHandler(tool: any, args: Record<string, any>): Promise<string> {
  switch (tool.handlerType) {
    case "webhook": {
      const url = tool.handlerCode;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      return text.slice(0, 5000);
    }
    case "javascript": {
      const fn = new Function("args", `"use strict"; ${tool.handlerCode}`);
      const result = fn(args);
      return typeof result === "string" ? result : JSON.stringify(result);
    }
    case "template": {
      let output = tool.handlerCode;
      for (const [key, value] of Object.entries(args)) {
        output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
      return output;
    }
    default:
      throw new Error(`Unknown handler type: ${tool.handlerType}`);
  }
}
