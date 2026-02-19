import React, { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { PixelPanel } from "./PixelPanel";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-8 right-8 z-[9999] flex flex-col gap-4 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto animate-fade-in-up">
            <PixelPanel
              title={t.type === "info" ? "SYSTEM_MSG" : t.type.toUpperCase()}
              className="!min-w-[250px] shadow-lg bg-blueprint-dark/95 backdrop-blur-md"
            >
              <div className="p-4 text-xs uppercase tracking-widest text-blueprint-light">
                {t.message}
              </div>
            </PixelPanel>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
