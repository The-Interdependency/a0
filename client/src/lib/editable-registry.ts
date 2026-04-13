// 40:16
/**
 * Frontend Editable Registry — client-side-only editable fields.
 *
 * Add new entries to FRONTEND_EDITABLE_SCHEMA for preferences and UI state
 * that have no backend endpoint. Each entry describes:
 *   - key: unique field identifier (must not clash with backend keys)
 *   - label / description: shown in the WSEM overlay
 *   - controlType: "text" | "select" | "toggle" | "textarea"
 *   - options: required when controlType is "select"
 *   - get(): reads the current value (localStorage or React state)
 *   - patch(value): writes the new value and triggers any re-render needed
 *   - queryKey: optional — if present, WSEM invalidates this after patching
 *
 * WSEM merges this array with the Python schema index at mount time.
 * Unused entries are tree-shaken; this file is the extension point.
 */

export interface FrontendEditableField {
  key: string;
  label: string;
  description: string;
  controlType: "text" | "select" | "toggle" | "textarea";
  options?: string[];
  get: () => string | boolean;
  patch: (value: string | boolean) => void;
  queryKey?: string;
}

const ACTIVE_TAB_KEY = "a0p_active_tab";
const SIDEBAR_COLLAPSED_KEY = "a0p_sidebar_collapsed";
const MARKDOWN_MODE_KEY = "a0p_markdown_mode";

export const FRONTEND_EDITABLE_SCHEMA: FrontendEditableField[] = [
  {
    key: "active_tab_default",
    label: "Default Console Tab",
    description: "Which console tab opens first when you load the page.",
    controlType: "text",
    get: () => localStorage.getItem(ACTIVE_TAB_KEY) ?? "",
    patch: (v) => localStorage.setItem(ACTIVE_TAB_KEY, String(v)),
  },
  {
    key: "sidebar_collapsed",
    label: "Sidebar Collapsed",
    description: "Whether the console sidebar starts in collapsed state.",
    controlType: "toggle",
    get: () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true",
    patch: (v) => localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? "true" : "false"),
  },
  {
    key: "markdown_render_mode",
    label: "Markdown Render Mode",
    description: "How markdown content is displayed across the console.",
    controlType: "select",
    options: ["formatted", "raw"],
    get: () => localStorage.getItem(MARKDOWN_MODE_KEY) ?? "formatted",
    patch: (v) => localStorage.setItem(MARKDOWN_MODE_KEY, String(v)),
  },
];
// 40:16
