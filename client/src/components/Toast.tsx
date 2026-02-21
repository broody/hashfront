import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import type { ReactNode } from "react";
import { PixelPanel } from "./PixelPanel";
import { PixelButton } from "./PixelButton";

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

interface ErrorModal {
  title: string;
  message: string;
  rawError?: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  toasts: ToastItem[];
  showErrorModal: (title: string, message: string, rawError?: string) => void;
  dismissErrorModal: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const ErrorModalOverlay: React.FC<{
  title: string;
  message: string;
  rawError?: string;
  onDismiss: () => void;
}> = ({ title, message, rawError, onDismiss }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [detailsOpen, rawError]);

  return (
    <div className="fixed inset-0 z-[100] bg-blueprint-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <PixelPanel title={title} className="!p-6">
          <div className="flex flex-col gap-5">
            <div className="flex-1 flex items-center justify-center py-4">
              <div className="text-sm uppercase tracking-widest text-blueprint-light break-words whitespace-pre-wrap text-center">
                {message}
              </div>
            </div>
            {rawError && (
              <div
                className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
                style={{ maxHeight: detailsOpen ? contentHeight : 0 }}
              >
                <div
                  ref={contentRef}
                  className="p-3 bg-blueprint-dark/80 border border-white/20 text-xs text-blueprint-light/70 break-all whitespace-pre-wrap max-h-48 overflow-y-auto font-mono normal-case tracking-normal custom-scrollbar"
                >
                  {rawError}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              {rawError ? (
                <button
                  type="button"
                  onClick={() => setDetailsOpen((o) => !o)}
                  className="text-xs uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity flex items-center gap-2"
                >
                  <span
                    className="inline-block transition-transform duration-200"
                    style={{
                      transform: detailsOpen ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  >
                    &gt;
                  </span>
                  FULL ERROR
                </button>
              ) : (
                <div />
              )}
              <PixelButton variant="gray" onClick={onDismiss}>
                DISMISS
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [errorModal, setErrorModal] = useState<ErrorModal | null>(null);

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

  const showErrorModal = useCallback(
    (title: string, message: string, rawError?: string) => {
      setErrorModal({ title, message, rawError });
    },
    [],
  );

  const dismissErrorModal = useCallback(() => {
    setErrorModal(null);
  }, []);

  return (
    <ToastContext.Provider
      value={{ toast, toasts, showErrorModal, dismissErrorModal }}
    >
      {children}
      {errorModal && (
        <ErrorModalOverlay
          title={errorModal.title}
          message={errorModal.message}
          rawError={errorModal.rawError}
          onDismiss={dismissErrorModal}
        />
      )}
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
