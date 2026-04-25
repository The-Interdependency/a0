// 11:3
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootstrapTheme } from "./hooks/use-theme-mode";

// Bootstrap mode (light/dark/system) from localStorage before first paint.
// Replaces the previous hardcoded `.add("dark")` so user choice + system
// preference are honored from the very first frame.
bootstrapTheme();

const SKIN_KEY = "a0p_skin";
const VALID_SKINS = ["tensor", "synthwave", "copper"] as const;
const saved = localStorage.getItem(SKIN_KEY) as (typeof VALID_SKINS)[number] | null;
const initial = saved && VALID_SKINS.includes(saved) ? saved : "tensor";
document.documentElement.classList.add(`theme-${initial}`);

createRoot(document.getElementById("root")!).render(<App />);
// 11:3
