// 5:0
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");

const SKIN_KEY = "a0p_skin";
const VALID_SKINS = ["tensor", "synthwave", "copper"] as const;
const saved = localStorage.getItem(SKIN_KEY) as (typeof VALID_SKINS)[number] | null;
const initial = saved && VALID_SKINS.includes(saved) ? saved : "tensor";
document.documentElement.classList.add(`theme-${initial}`);

createRoot(document.getElementById("root")!).render(<App />);
// 5:0
