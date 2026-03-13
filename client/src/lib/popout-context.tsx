import { createContext, useContext, useState } from "react";

interface PopoutState {
  content: string | null;
  label: string;
  pinContent: (content: string, label?: string) => void;
  clearContent: () => void;
}

const PopoutContext = createContext<PopoutState>({
  content: null,
  label: "",
  pinContent: () => {},
  clearContent: () => {},
});

export function PopoutProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<string | null>(null);
  const [label, setLabel] = useState("Pinned Response");

  function pinContent(c: string, l = "Pinned Response") {
    setContent(c);
    setLabel(l);
  }

  function clearContent() {
    setContent(null);
  }

  return (
    <PopoutContext.Provider value={{ content, label, pinContent, clearContent }}>
      {children}
    </PopoutContext.Provider>
  );
}

export function usePopout() {
  return useContext(PopoutContext);
}
