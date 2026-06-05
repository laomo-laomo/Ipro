'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { StyleSelector } from './style-selector';
import type { Character, StyleType } from '@/types/character';
import { Check, Image as ImageIcon, Loader2, RotateCcw, Sparkles } from 'lucide-react';

export interface CharacterStylizerProps {
  character: Character;
  selectedStyle: StyleType;
  onStyleChange: (style: StyleType) => void;
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
  onStylize,
  isStylizing = false,
  stylizeError = null,
  disabled = false,
  className,
}: CharacterStylizerProps) {
  const [showComparison, setShowComparison] = useState(false);
  // sessionLocked tracks whether the current character has ever successfully completed stylization in this session
  const [sessionLocked, setSessionLocked] = useState(false);
  const wasStylizing = useRef(false);

  useEffect(() => {
    if (character.id) {
      // Character changed — reset session lock so we always start fresh
      setSessionLocked(false);
    }
  }, [character.id]);

  // Detect when stylization finished successfully
  useEffect(() => {
    if (wasStylizing.current && !isStylizing && !stylizeError && character.id) {
      setSessionLocked(true);
    }
    wasStylizing.current = isStylizing;
  }, [isStylizing, stylizeError, character.id]);

  const showStylized = sessionLocked && character.stylizedPhotoUrl;

return (
    <div className={cn('space-y-6', className)}>
      <div className="rounded-[30px] border border-white/70 bg-white/80 p-5 shadow-paper backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-rose-600">魔法变身</p>
            <h3 className="mt-1 text-2xl font-bold">从真实照片，到绘本角色</h3>
          </div>
          {character.stylizedPhotoUrl && (
            <button
              type="button"
              onClick={() => setShowComparison(!showComparison)}
              className="rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              {showComparison ? '分开显示' : '对比查看'}
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-[26px] border border-white/70 bg-gradient-to-br from-violet-100 to-white p-2 shadow-sm">
              <div className="flex h-full items-center justify-center overflow-hidden rounded-[20px] bg-white">
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
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-amber-400 text-white shadow-magic', isStylizing && 'animate-pulse')}>
              <Sparkles className="h-6 w-6" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-[26px] border border-white/70 bg-gradient-to-br from-rose-100 to-amber-50 p-2 shadow-sm">
              <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[20px] bg-white">
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

      <div className="rounded-[30px] border border-white/70 bg-white/80 p-5 shadow-paper backdrop-blur-xl">
        <div className="mb-4">
          <p className="text-sm font-medium text-rose-600">选择风格</p>
          <h3 className="mt-1 text-xl font-bold">挑一个最像你心中童话世界的画风</h3>
        </div>
        <StyleSelector selectedStyle={selectedStyle} onStyleChange={onStyleChange} disabled={disabled || isStylizing} />

<div className="mt-5 flex gap-3">
          <Button onClick={onStylize} disabled={disabled || isStylizing} className="flex-1 rounded-full" variant="magic">
            {isStylizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                应用中...
              </>
            ) : sessionLocked ? (
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
