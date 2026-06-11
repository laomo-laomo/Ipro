'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { CustomStylePrompt, StyleType } from '@/types/character';
import { STYLE_OPTIONS } from '@/types/character';
import {
  Brush,
  Cloud,
  Crown,
  Droplets,
  Film,
  Flame,
  Flower2,
  Gem,
  Heart,
  Leaf,
  Moon,
  MoreVertical,
  Palette,
  Pencil,
  Shapes,
  Snowflake,
  Sparkles,
  Stars,
  Sun,
  Wand2,
  Zap,
} from 'lucide-react';

// Preset-style map. Mirrors the same look as the old 4-card list but now
// covers all 8 STYLE_OPTIONS so the picker reflects the full prompt library.
const STYLE_ICONS: Record<StyleType, React.ReactNode> = {
  pixar: <Film className="h-5 w-5" />,
  ghibli: <Sparkles className="h-5 w-5" />,
  clay: <Shapes className="h-5 w-5" />,
  handdrawn: <Pencil className="h-5 w-5" />,
  watercolor: <Droplets className="h-5 w-5" />,
  paper: <Wand2 className="h-5 w-5" />,
  comic: <Zap className="h-5 w-5" />,
  papercut: <Brush className="h-5 w-5" />,
};

const STYLE_SURFACES: Record<StyleType, string> = {
  pixar: 'from-orange-300 via-amber-100 to-yellow-50',
  ghibli: 'from-sky-300 via-cyan-100 to-white',
  clay: 'from-emerald-300 via-lime-100 to-white',
  handdrawn: 'from-rose-300 via-pink-100 to-white',
  watercolor: 'from-cyan-200 via-sky-100 to-white',
  paper: 'from-amber-200 via-yellow-50 to-white',
  comic: 'from-yellow-200 via-amber-100 to-white',
  papercut: 'from-rose-200 via-red-100 to-amber-50',
};

const STYLE_IMAGES: Record<StyleType, string> = {
  pixar: '/styles/pixar.svg',
  ghibli: '/styles/ghibli.svg',
  clay: '/styles/clay.svg',
  handdrawn: '/styles/handdrawn.svg',
  watercolor: '/styles/watercolor.svg',
  paper: '/styles/paper.svg',
  comic: '/styles/comic.svg',
  papercut: '/styles/papercut.svg',
};

// 8-color Tailwind gradient families the backend's zod validator accepts
// (see `ALLOWED_COLOR_THEMES` in `apps/api/src/routes/style/index.ts`).
// Kept in sync on purpose — adding a 9th chip here would 400 from the API.
const COLOR_SURFACE_MAP: Record<string, string> = {
  orange: 'from-orange-300 via-amber-100 to-yellow-50',
  sky: 'from-sky-300 via-cyan-100 to-white',
  emerald: 'from-emerald-300 via-lime-100 to-white',
  rose: 'from-rose-300 via-pink-100 to-white',
  violet: 'from-violet-300 via-fuchsia-100 to-white',
  amber: 'from-amber-300 via-yellow-50 to-white',
  cyan: 'from-cyan-200 via-sky-100 to-white',
  lime: 'from-lime-300 via-emerald-100 to-white',
};

/**
 * Single source of truth for the gradient a card should wear. Falls back to
 * violet for legacy rows whose `colorTheme` predates the explicit enum, so
 * an old custom style in the DB still renders something reasonable.
 */
export function getStyleSurface(colorTheme: string): string {
  return COLOR_SURFACE_MAP[colorTheme] || COLOR_SURFACE_MAP.violet;
}

// Lucide icon name → component. Whitelist is shared with the backend
// validator (see `ALLOWED_ICON_NAMES` in `apps/api/src/routes/style/index.ts`).
// Keep both lists in sync — adding a name here without server support will
// result in a card the user can never save.
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Palette,
  Brush,
  Wand2,
  Stars,
  Flame,
  Snowflake,
  Sun,
  Moon,
  Cloud,
  Leaf,
  Flower2,
  Heart,
  Crown,
  Gem,
};

export function getStyleIcon(iconName: string) {
  const Icon = ICON_MAP[iconName] || Sparkles;
  return <Icon className="h-5 w-5" />;
}

// Stable, type-narrow identifier for a custom style. We prefix with `custom:`
// so a downstream consumer can `value.startsWith('custom:')` to know it
// holds a custom-style id and not a preset key, even though the parent
// `onStyleChange` callback is loosely typed as `string`.
export function customStyleValue(id: string): string {
  return `custom:${id}`;
}

export function isCustomStyleValue(value: string): boolean {
  return value.startsWith('custom:');
}

export function customStyleIdFromValue(value: string): string | null {
  return isCustomStyleValue(value) ? value.slice('custom:'.length) : null;
}

export function isPresetStyleValue(value: string): value is StyleType {
  return (STYLE_OPTIONS as { id: string }[]).some((s) => s.id === value);
}

export interface StyleSelectorProps {
  // The selected value. Accepts either a StyleType preset key (e.g. "pixar")
  // or a `custom:<id>` string for a user-defined style. The parent decides
  // how to resolve it into the actual StyleInput sent to /stylize.
  selectedStyle: string;
  onStyleChange: (style: string) => void;
  // User-defined styles to render after the 8 presets. Optional so the
  // selector stays usable from contexts that don't manage custom styles
  // (e.g. a future "use preset only" page).
  customStyles?: CustomStylePrompt[];
  onCreateCustom?: () => void;
  onEditCustom?: (id: string) => void;
  onDeleteCustom?: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

// Tiny popover menu for the per-card 编辑/删除 affordance. We avoid pulling
// in @radix-ui/react-dropdown-menu (not in package.json) and just render a
// click-toggle + outside-click handler — it does the same job for two
// entries and is much smaller to ship.
function CustomCardMenu({
  onEdit,
  onDelete,
  disabled,
}: {
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="absolute right-2 top-2 z-10"
      // Stop the parent <button>'s click handler from firing when the user
      // interacts with the menu — the parent selects the card on any click.
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="更多操作"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/90 text-foreground/70 shadow-sm transition hover:bg-white hover:text-foreground disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 min-w-[120px] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-[0_18px_40px_-18px_rgba(76,29,149,0.45)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="block w-full px-4 py-2 text-left text-sm font-medium text-foreground/80 transition hover:bg-violet-50 hover:text-violet-700"
          >
            编辑
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-4 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}

export function StyleSelector({
  selectedStyle,
  onStyleChange,
  customStyles = [],
  onCreateCustom,
  onEditCustom,
  onDeleteCustom,
  disabled = false,
  className,
}: StyleSelectorProps) {
  const showCreate = Boolean(onCreateCustom);

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4', className)}>
      {STYLE_OPTIONS.map((style) => {
        const isSelected = selectedStyle === style.id;

        return (
          <button
            key={style.id}
            type="button"
            onClick={() => onStyleChange(style.id)}
            disabled={disabled}
            className={cn(
              'group rounded-[26px] border p-2 text-left transition-all duration-200',
              isSelected ? 'border-violet-400 bg-violet-50/80 shadow-magic scale-[1.02]' : 'border-white/70 bg-white/82 hover:-translate-y-1 hover:shadow-paper',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className={cn('relative aspect-[4/5] overflow-hidden rounded-[20px] bg-gradient-to-br p-4', STYLE_SURFACES[style.id])}>
              <Image src={STYLE_IMAGES[style.id]} alt={style.name} fill className="object-cover opacity-95 mix-blend-multiply" sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw" />
              <div className="relative flex h-full flex-col justify-between rounded-[16px] border border-white/60 bg-white/25 p-3 backdrop-blur-sm">
                <div className={cn('flex h-11 w-11 items-center justify-center rounded-full', isSelected ? 'bg-white text-violet-700' : 'bg-white/70 text-foreground/70')}>
                  {STYLE_ICONS[style.id]}
                </div>
                <div className="rounded-[16px] bg-black/10 p-3 backdrop-blur-[2px]">
                  <p className="text-sm font-bold text-magic-ink">{style.name}</p>
                  <p className="mt-1 text-xs leading-5 text-magic-ink/75">{style.description}</p>
                </div>
              </div>
            </div>
            {isSelected && <div className="px-2 pb-1 pt-3 text-center text-xs font-semibold text-violet-700">已选中这套画风</div>}
          </button>
        );
      })}

      {customStyles.map((style) => {
        const value = customStyleValue(style.id);
        const isSelected = selectedStyle === value;

        // We use a <div role="button"> here (not <button>) so the card can host
        // another interactive element (the 编辑/删除 menu) without violating
        // the HTML rule that forbids <button> nested inside <button>. The
        // tabIndex / onKeyDown / role pair keeps keyboard users happy.
        return (
          <div
            key={style.id}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={isSelected}
            aria-label={style.name}
            onClick={() => onStyleChange(value)}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onStyleChange(value);
              }
            }}
            className={cn(
              'group relative cursor-pointer rounded-[26px] border p-2 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
              isSelected ? 'border-violet-400 bg-violet-50/80 shadow-magic scale-[1.02]' : 'border-white/70 bg-white/82 hover:-translate-y-1 hover:shadow-paper',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div className={cn('relative aspect-[4/5] overflow-hidden rounded-[20px] bg-gradient-to-br p-4', getStyleSurface(style.colorTheme))}>
              <div className="relative flex h-full flex-col justify-between rounded-[16px] border border-white/60 bg-white/30 p-3 backdrop-blur-sm">
                <div className={cn('flex h-11 w-11 items-center justify-center rounded-full', isSelected ? 'bg-white text-violet-700' : 'bg-white/80 text-foreground/70')}>
                  {getStyleIcon(style.iconName)}
                </div>
                <div className="rounded-[16px] bg-black/10 p-3 backdrop-blur-[2px]">
                  <p className="text-sm font-bold text-magic-ink">{style.name}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-magic-ink/75">
                    {style.prompt.length > 60 ? `${style.prompt.slice(0, 60)}…` : style.prompt}
                  </p>
                </div>
              </div>
            </div>
            {isSelected && <div className="px-2 pb-1 pt-3 text-center text-xs font-semibold text-violet-700">已选中这套画风</div>}
            {(onEditCustom || onDeleteCustom) && (
              <CustomCardMenu
                onEdit={() => onEditCustom?.(style.id)}
                onDelete={() => onDeleteCustom?.(style.id)}
                disabled={disabled}
              />
            )}
          </div>
        );
      })}

      {showCreate && (
        <button
          type="button"
          onClick={onCreateCustom}
          disabled={disabled}
          className={cn(
            'group flex aspect-[4/5] flex-col items-center justify-center rounded-[26px] border-2 border-dashed border-violet-300/70 bg-white/60 p-4 text-center text-violet-600 transition-all duration-200 hover:-translate-y-1 hover:border-violet-400 hover:bg-violet-50/70',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-violet-300 bg-white text-violet-500 transition group-hover:border-violet-400 group-hover:text-violet-600">
            <span className="text-2xl leading-none">+</span>
          </div>
          <p className="mt-3 text-sm font-semibold">新建风格</p>
          <p className="mt-1 text-xs leading-5 text-violet-500/80">用一段文字描述你的专属画风</p>
        </button>
      )}
    </div>
  );
}
