'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
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

export interface FormState {
  name: string;
  prompt: string;
  colorTheme: string;
  iconName: string;
}

export const DEFAULT_FORM: FormState = {
  name: '',
  prompt: '',
  colorTheme: 'violet',
  iconName: 'Sparkles',
};

export function formFromStyle(style: CustomStylePrompt): FormState {
  return {
    name: style.name,
    prompt: style.prompt,
    colorTheme: style.colorTheme,
    iconName: style.iconName,
  };
}

export function validateForm(form: FormState): string | null {
  if (form.name.length < NAME_MIN) return '风格名称不能为空';
  if (form.name.length > NAME_MAX) return `风格名称不能超过 ${NAME_MAX} 字`;
  if (form.prompt.length < PROMPT_MIN) return '风格描述不能为空';
  if (form.prompt.length > PROMPT_MAX) return `风格描述不能超过 ${PROMPT_MAX} 字`;
  return null;
}

// Reusable form body. Rendered both inside the modal (legacy /create/stylize
// quick-create) and on the standalone /styles/new + /styles/[id] pages, so
// the field layout stays identical regardless of which surface the user
// landed on.
export function CustomStyleFormFields({
  form,
  onChange,
  disabled,
  error,
}: {
  form: FormState;
  onChange: (next: FormState) => void;
  disabled?: boolean;
  error?: string | null;
}): ReactNode {
  const nameLength = form.name.length;
  const promptLength = form.prompt.length;
  return (
    <div className="space-y-5">
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
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          maxLength={NAME_MAX + 8}
          placeholder="例如：日式水彩童话"
          disabled={disabled}
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
          onChange={(event) => onChange({ ...form, prompt: event.target.value })}
          maxLength={PROMPT_MAX + 32}
          placeholder="例：日系水彩童话插画，柔和的晨光穿过薄雾，柔焦的森林小径，粉彩色调与金箔点缀，角色用细腻的水彩笔触呈现，背景留白给人想象空间。"
          disabled={disabled}
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
                onClick={() => onChange({ ...form, colorTheme: color.value })}
                disabled={disabled}
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
                onClick={() => onChange({ ...form, iconName })}
                disabled={disabled}
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
    </div>
  );
}

// Hook that owns the form state + submit lifecycle. Returns everything a
// caller needs to render the page/modal body: form, setForm, the validation
// message, the submit handler, and the loading flag.
export function useCustomStyleForm({
  initial,
  editingId,
  onSaved,
}: {
  initial?: CustomStylePrompt | null;
  editingId?: string;
  onSaved?: (saved: CustomStylePrompt) => void;
}) {
  const [form, setForm] = useState<FormState>(initial ? formFromStyle(initial) : DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setForm(formFromStyle(initial));
  }, [initial]);

  const validationError = useMemo(() => validateForm(form), [form]);
  const isDisabled = submitting || Boolean(validationError);

  const handleSubmit = async () => {
    if (validationError) {
      setError(validationError);
      return false;
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
      const saved = editingId
        ? await updateCustomStyle(editingId, payload)
        : await createCustomStyle(payload);
      onSaved?.(saved);
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      setError(message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return { form, setForm, validationError, error, submitting, isDisabled, handleSubmit };
}
