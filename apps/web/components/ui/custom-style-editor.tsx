'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { useToast } from './toast';
import { getStyleIcon, getStyleSurface } from './style-selector';
import {
  CustomStyleFormFields,
  DEFAULT_FORM,
  formFromStyle,
  useCustomStyleForm,
  type FormState,
} from './custom-style-form';
import type { CustomStylePrompt } from '@/types/character';

export interface CustomStyleEditorProps {
  // Open / close the dialog. The parent owns the state.
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // When set, the dialog runs in "edit" mode and PATCHes the row.
  // When null, it creates a new one.
  editing?: CustomStylePrompt | null;
  // Fired after a successful create / update so the parent can refetch its
  // `customStyles` list and (optionally) flip the selected card to the new
  // value.
  onSaved?: (saved: CustomStylePrompt) => void;
}

export function CustomStyleEditor({
  open,
  onOpenChange,
  editing = null,
  onSaved,
}: CustomStyleEditorProps): ReactNode {
  const isEditMode = Boolean(editing);
  const { success: showSuccess, error: showError } = useToast();

  // Local mirror so we can pre-fill the form on open without losing keystrokes
  // mid-edit. The hook handles the "reset on open / on target swap" lifecycle.
  const [initial, setInitial] = useState<CustomStylePrompt | null>(editing);

  useEffect(() => {
    if (open) setInitial(editing);
  }, [open, editing]);

  const { form, setForm, error, submitting, isDisabled, handleSubmit } = useCustomStyleForm({
    initial,
    editingId: editing?.id,
    onSaved: (saved) => {
      showSuccess(isEditMode ? '自定义风格已更新' : '自定义风格已创建');
      onSaved?.(saved);
      onOpenChange(false);
    },
  });

  // If the user closed/reopened, mirror the dialog state into the form so
  // it doesn't keep stale text after they cancelled a half-typed entry.
  useEffect(() => {
    if (open) {
      setForm(editing ? formFromStyle(editing) : DEFAULT_FORM);
    }
  }, [open, editing, setForm]);

  // Close on Escape so the modal behaves like a real dialog.
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onOpenChange(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, submitting, onOpenChange]);

  // Lock body scroll while the dialog is mounted so a long form behind it
  // doesn't fight for scroll position.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await handleSubmit();
    if (saved && error) showError(error);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-[#1E1B2E]/55 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-style-editor-title"
            className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-[0_30px_80px_-30px_rgba(76,29,149,0.6)] backdrop-blur-xl"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className={cn('relative bg-gradient-to-br p-6 pb-4', getStyleSurface(form.colorTheme))}>
              <button
                type="button"
                onClick={handleClose}
                aria-label="关闭"
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/85 text-foreground/70 transition hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/85 text-violet-600 shadow-sm">
                  {getStyleIcon(form.iconName)}
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-[0.18em] text-violet-700/80 uppercase">
                    {isEditMode ? '编辑自定义风格' : '新建自定义风格'}
                  </p>
                  <h2 id="custom-style-editor-title" className="mt-1 text-xl font-bold text-magic-ink">
                    {isEditMode ? '调整你的专属画风' : '用一段文字描述你的专属画风'}
                  </h2>
                </div>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-5 px-6 py-5">
              <CustomStyleFormFields
                form={form}
                onChange={setForm as (next: FormState) => void}
                disabled={submitting}
                error={error}
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={submitting}
                  className="rounded-full"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="magic"
                  className="rounded-full"
                  disabled={isDisabled}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      保存中…
                    </>
                  ) : isEditMode ? (
                    '保存修改'
                  ) : (
                    '创建风格'
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Lightweight confirm dialog used by StyleSelector's delete affordance. Lives
// here (rather than in a new file) because it's a one-off consumer of the
// styling tokens and shares the same body-scroll-lock + Escape behaviour
// as the editor.
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactNode {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-[#1E1B2E]/55 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="relative w-full max-w-sm rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_30px_80px_-30px_rgba(76,29,149,0.6)] backdrop-blur-xl"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <h3 id="confirm-dialog-title" className="text-lg font-bold text-magic-ink">
              {title}
            </h3>
            <div className="mt-2 text-sm leading-7 text-muted-foreground">{message}</div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={onCancel} className="rounded-full">
                {cancelLabel}
              </Button>
              <Button
                type="button"
                onClick={onConfirm}
                className={cn('rounded-full', destructive ? 'bg-rose-500 text-white hover:bg-rose-600' : '')}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
