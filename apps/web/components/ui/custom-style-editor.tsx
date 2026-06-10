'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { useToast } from './toast';
import {
  createCustomStyle,
  updateCustomStyle,
  type CreateCustomStyleInput,
} from '@/lib/api/style';
import { getStyleIcon, getStyleSurface } from './style-selector';
import type { CustomStylePrompt } from '@/types/character';

// Reuse the same whitelist the backend validator enforces, so the picker
// only ever submits a value the API will accept. If the user picks an icon
// the backend doesn't know about the create call 400s — easier to keep
// these two arrays in lockstep than to surface a validation error.
const COLOR_OPTIONS = [
  { value: 'orange', label: '暖橙' },
  { value: 'sky', label: '天蓝' },
  { value: 'emerald', label: '森林' },
  { value: 'rose', label: '樱粉' },
  { value: 'violet', label: '紫罗兰' },
  { value: 'amber', label: '琥珀' },
  { value: 'cyan', label: '青蓝' },
  { value: 'lime', label: '嫩绿' },
] as const;

const ICON_OPTIONS = [
  'Sparkles',
  'Palette',
  'Brush',
  'Wand2',
  'Stars',
  'Flame',
  'Snowflake',
  'Sun',
  'Moon',
  'Cloud',
] as const;

const NAME_MIN = 1;
const NAME_MAX = 30;
const PROMPT_MIN = 1;
const PROMPT_MAX = 2000;

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

interface FormState {
  name: string;
  prompt: string;
  colorTheme: string;
  iconName: string;
}

const DEFAULT_FORM: FormState = {
  name: '',
  prompt: '',
  colorTheme: 'violet',
  iconName: 'Sparkles',
};

export function CustomStyleEditor({
  open,
  onOpenChange,
  editing = null,
  onSaved,
}: CustomStyleEditorProps): ReactNode {
  const isEditMode = Boolean(editing);
  const { success: showSuccess, error: showError } = useToast();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the dialog opens or the editing target swaps.
  // Doing it in an effect (rather than in a useMemo on `open`) keeps the
  // fields editable on the first paint and avoids a "stuck old value" when
  // the parent toggles open quickly.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        prompt: editing.prompt,
        colorTheme: editing.colorTheme,
        iconName: editing.iconName,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setError(null);
  }, [open, editing]);

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

  const nameLength = form.name.length;
  const promptLength = form.prompt.length;
  const validationError = useMemo<string | null>(() => {
    if (nameLength < NAME_MIN) return '风格名称不能为空';
    if (nameLength > NAME_MAX) return `风格名称不能超过 ${NAME_MAX} 字`;
    if (promptLength < PROMPT_MIN) return '风格描述不能为空';
    if (promptLength > PROMPT_MAX) return `风格描述不能超过 ${PROMPT_MAX} 字`;
    return null;
  }, [nameLength, promptLength]);
  const isDisabled = submitting || Boolean(validationError);

  const handleClose = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload: CreateCustomStyleInput = {
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      colorTheme: form.colorTheme,
      iconName: form.iconName,
    };
    try {
      const saved = isEditMode && editing
        ? await updateCustomStyle(editing.id, payload)
        : await createCustomStyle(payload);
      showSuccess(isEditMode ? '自定义风格已更新' : '自定义风格已创建');
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
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

            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="custom-style-name" className="text-sm font-semibold text-foreground/85">
                    名称 <span className="text-rose-500">*</span>
                  </label>
                  <span className={cn('text-xs', nameLength > NAME_MAX ? 'text-rose-500' : 'text-muted-foreground')}>
                    {nameLength}/{NAME_MAX}
                  </span>
                </div>
                <Input
                  id="custom-style-name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  maxLength={NAME_MAX + 8}
                  placeholder="例如：日式水彩童话"
                  disabled={submitting}
                  className="h-11 rounded-xl border-violet-200 bg-white/80 text-base"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="custom-style-prompt" className="text-sm font-semibold text-foreground/85">
                    风格 prompt <span className="text-rose-500">*</span>
                  </label>
                  <span className={cn('text-xs', promptLength > PROMPT_MAX ? 'text-rose-500' : 'text-muted-foreground')}>
                    {promptLength}/{PROMPT_MAX}
                  </span>
                </div>
                <textarea
                  id="custom-style-prompt"
                  value={form.prompt}
                  onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
                  maxLength={PROMPT_MAX + 32}
                  placeholder="例：日系水彩童话插画，柔和的晨光穿过薄雾，柔焦的森林小径，粉彩色调与金箔点缀，角色用细腻的水彩笔触呈现，背景留白给人想象空间。"
                  disabled={submitting}
                  rows={5}
                  className={cn(
                    'flex w-full rounded-xl border border-violet-200 bg-white/80 px-3 py-2 text-sm shadow-sm transition-colors',
                    'placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300',
                    'disabled:cursor-not-allowed disabled:opacity-60'
                  )}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  这段文字会作为 AI 图像生成的画风提示，建议包含：媒介、色彩、灯光、构图和氛围。
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground/85">配色</p>
                <div className="grid grid-cols-8 gap-2">
                  {COLOR_OPTIONS.map((color) => {
                    const isActive = form.colorTheme === color.value;
                    return (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, colorTheme: color.value }))}
                        disabled={submitting}
                        title={color.label}
                        aria-label={color.label}
                        aria-pressed={isActive}
                        className={cn(
                          'group relative aspect-square overflow-hidden rounded-xl border-2 transition',
                          isActive ? 'border-violet-500 shadow-magic' : 'border-white/70 hover:border-violet-200'
                        )}
                      >
                        <div className={cn('absolute inset-0 bg-gradient-to-br', getStyleSurface(color.value))} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground/85">图标</p>
                <div className="grid grid-cols-5 gap-2">
                  {ICON_OPTIONS.map((iconName) => {
                    const isActive = form.iconName === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, iconName }))}
                        disabled={submitting}
                        aria-label={iconName}
                        aria-pressed={isActive}
                        className={cn(
                          'flex aspect-square items-center justify-center rounded-xl border-2 transition',
                          isActive
                            ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-magic'
                            : 'border-white/70 bg-white/80 text-foreground/70 hover:border-violet-200 hover:text-violet-600'
                        )}
                      >
                        {getStyleIcon(iconName)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50/85 px-3 py-2 text-sm text-rose-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

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
