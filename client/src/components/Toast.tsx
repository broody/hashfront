import React, { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { PixelPanel } from "./PixelPanel";

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  linkUrl?: string;
  linkLabel?: string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  linkUrl?: string;
  linkLabel?: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (message: string, type: ToastType = "info", options: ToastOptions = {}) => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          type,
          linkUrl: options.linkUrl,
          linkLabel: options.linkLabel,
        },
      ]);

      // Auto-remove after 3 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast, toasts }}>
      {children}
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

export const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="absolute bottom-8 right-8 z-50 flex flex-col gap-4 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto animate-fade-in-up">
          <PixelPanel
            title={t.type === "info" ? "SYSTEM_MSG" : t.type.toUpperCase()}
            className="!min-w-[250px] shadow-lg bg-blueprint-dark/95 backdrop-blur-md"
          >
            <div className="p-4 text-xs uppercase tracking-widest text-blueprint-light">
              {t.message}
              {t.linkUrl && (
                <div className="mt-2">
                  <a
                    href={t.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:opacity-80 break-all"
                  >
                    {t.linkLabel ?? "OPEN IN EXPLORER"}
                  </a>
                </div>
              )}
            </div>
          </PixelPanel>
        </div>
      ))}
    </div>
  );
};
