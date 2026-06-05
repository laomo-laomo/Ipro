'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const ctx: ToastContextValue = {
    toast: addToast,
    success: (message) => addToast('success', message),
    error: (message) => addToast('error', message),
    info: (message) => addToast('info', message),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 36, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 36, scale: 0.96 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={cn(
                'pointer-events-auto flex min-w-[260px] items-center gap-3 rounded-[22px] border px-4 py-3 shadow-[0_20px_50px_-24px_rgba(76,29,149,0.55)] backdrop-blur-xl',
                toast.type === 'success' && 'border-emerald-200 bg-white/92 text-emerald-700',
                toast.type === 'error' && 'border-rose-200 bg-white/92 text-rose-700',
                toast.type === 'info' && 'border-violet-200 bg-white/92 text-violet-700'
              )}
            >
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full',
                toast.type === 'success' && 'bg-emerald-100',
                toast.type === 'error' && 'bg-rose-100',
                toast.type === 'info' && 'bg-violet-100'
              )}>
                {toast.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0" />}
                {toast.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
                {toast.type === 'info' && <Info className="h-4 w-4 shrink-0" />}
              </div>
              <span className="flex-1 text-sm font-medium text-foreground/85">{toast.message}</span>
              <button onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))} className="shrink-0 text-muted-foreground transition hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
