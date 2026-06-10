'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { StyleSelector } from './style-selector';
import type { Character, CustomStylePrompt } from '@/types/character';
import { Check, Image as ImageIcon, Loader2, RotateCcw, Sparkles } from 'lucide-react';

export interface CharacterStylizerProps {
  character: Character;
  // Either a StyleType preset key (e.g. "pixar") or a `custom:<id>` string
  // for a user-defined style. The parent resolves it into the actual
  // StyleInput sent to /stylize.
  selectedStyle: string;
  onStyleChange: (style: string) => void;
  customStyles?: CustomStylePrompt[];
  onCreateCustom?: () => void;
  onEditCustom?: (id: string) => void;
  onDeleteCustom?: (id: string) => void;
  onStylize: () => void;
  onReset: () => void;
  onStylizeComplete?: () => void;
  isStylizing?: boolean;
  stylizeError?: string | null;
  disabled?: boolean;
  className?: string;
}

export function CharacterStylizer({
  character,
  selectedStyle,
  onStyleChange,
  customStyles,
  onCreateCustom,
  onEditCustom,
  onDeleteCustom,
  onStylize,
  isStylizing = false,
  stylizeError = null,
  disabled = false,
  className,
}: CharacterStylizerProps) {
  const [showComparison, setShowComparison] = useState(false);
  // Whether the user has kicked off at least one stylize for the current character
  // in this session. The local state used to gate the "已生成的角色" image — but
  // it broke back-nav: navigating /create/stylize → /create/generate → /create/stylize
  // would remount the component with a clean ref, so `wasStylizing.current` was
  // always `false` on remount and the stylized image vanished even though
  // `character.stylizedPhotoUrl` was populated.
  //
  // Fix: derive the display purely from the persisted URL, and track a session
  // flag ONLY for the button label ("重新生成" vs "应用风格"). The dev-seed
  // `Character.stylizedPhotoUrl` was historically set to a `/styles/pixar.svg`
  // placeholder, but the API now omits that field entirely for new characters
  // (see `stylizeCharacter` in ai.service.ts), so a truthy URL is always a real
  // result.
  const [hasStylizedInSession, setHasStylizedInSession] = useState(false);
  const wasStylizing = useRef(false);

  useEffect(() => {
    if (character.id) {
      // Character changed — reset session flag so the button shows "应用风格" again.
      setHasStylizedInSession(false);
    }
  }, [character.id]);

  // Detect when stylization finished successfully
  useEffect(() => {
    if (wasStylizing.current && !isStylizing && !stylizeError && character.id) {
      setHasStylizedInSession(true);
    }
    wasStylizing.current = isStylizing;
  }, [isStylizing, stylizeError, character.id]);

  const showStylized = Boolean(character.stylizedPhotoUrl);

return (
    <div className={cn('space-y-5 md:space-y-6', className)}>
      <div className="rounded-[24px] border border-white/70 bg-white/82 p-4 shadow-paper backdrop-blur-xl md:rounded-[30px] md:p-5">
        <div className="mb-4 flex items-center justify-between gap-3 md:mb-5 md:gap-4">
          <div>
            <p className="text-sm font-medium text-rose-600">魔法变身</p>
            <h3 className="mt-1 text-xl font-bold md:text-2xl">从真实照片，到绘本角色</h3>
          </div>
          {character.stylizedPhotoUrl && (
            <button
              type="button"
              onClick={() => setShowComparison(!showComparison)}
              className="shrink-0 rounded-full border border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground md:px-4"
            >
              {showComparison ? '分开显示' : '对比查看'}
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-[22px] border border-white/70 bg-gradient-to-br from-violet-100 to-white p-2 shadow-sm md:rounded-[26px]">
              <div className="flex h-full items-center justify-center overflow-hidden rounded-[16px] bg-white md:rounded-[20px]">
                {character.originalPhotoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={character.originalPhotoUrl} alt="原图" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-14 w-14 text-muted-foreground/40" />
                )}
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">原始照片</p>
          </div>

          <div className="flex items-center justify-center">
            <div className={cn('flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-amber-400 text-white shadow-magic md:h-14 md:w-14', isStylizing && 'animate-pulse')}>
              <Sparkles className="h-5 w-5 md:h-6 md:w-6" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-[22px] border border-white/70 bg-gradient-to-br from-rose-100 to-amber-50 p-2 shadow-sm md:rounded-[26px]">
              <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[16px] bg-white md:rounded-[20px]">
                {isStylizing ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1E1B2E]/72 text-white">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
                    <p className="mt-2 text-sm">魔法正在发生...</p>
                  </div>
                ) : showStylized && character.stylizedPhotoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={character.stylizedPhotoUrl} alt="风格化后" className="h-full w-full object-cover" />
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <ImageIcon className="h-14 w-14 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">选择风格后会在这里出现新角色</span>
                  </div>
                )}
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">风格化角色</p>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-white/70 bg-white/82 p-4 shadow-paper backdrop-blur-xl md:rounded-[30px] md:p-5">
        <div className="mb-4">
          <p className="text-sm font-medium text-rose-600">选择风格</p>
          <h3 className="mt-1 text-lg font-bold md:text-xl">挑一个最像你心中童话世界的画风</h3>
        </div>
        <StyleSelector
          selectedStyle={selectedStyle}
          onStyleChange={onStyleChange}
          customStyles={customStyles}
          onCreateCustom={onCreateCustom}
          onEditCustom={onEditCustom}
          onDeleteCustom={onDeleteCustom}
          disabled={disabled || isStylizing}
        />

<div className="mt-5 flex gap-3">
          <Button onClick={onStylize} disabled={disabled || isStylizing} className="flex-1 rounded-full" variant="magic">
            {isStylizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                应用中...
              </>
            ) : hasStylizedInSession ? (
              <>
                <RotateCcw className="h-4 w-4" />
                重新生成
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                应用风格
              </>
            )}
          </Button>
        </div>
      </div>

      {character.featureDesc && (
        <div className="rounded-[24px] border border-amber-100 bg-amber-50/80 p-4">
          <p className="text-xs font-semibold tracking-[0.18em] text-amber-700 uppercase">角色特征识别</p>
          <p className="mt-2 text-sm leading-7 text-foreground/80">{character.featureDesc}</p>
        </div>
      )}
    </div>
  );
}
