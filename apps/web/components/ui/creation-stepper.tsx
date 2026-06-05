'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export type StepKey = 'upload' | 'stylize' | 'story' | 'generate' | 'gallery';

interface Step {
  key: StepKey;
  label: string;
  href: string;
}

const STEPS: Step[] = [
  { key: 'upload', label: '上传照片', href: '/create/upload' },
  { key: 'story', label: '选择故事', href: '/create/story' },
  { key: 'stylize', label: '选择风格', href: '/create/stylize' },
  { key: 'generate', label: '生成绘本', href: '/create/generate' },
  { key: 'gallery', label: '我的作品', href: '/gallery' },
];

interface CreationStepperProps {
  current: StepKey;
  characterId?: string;
  storyId?: string;
  className?: string;
}

export function CreationStepper({ current, characterId, storyId, className }: CreationStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className={cn('overflow-x-auto rounded-[28px] border border-white/70 bg-white/75 p-3 shadow-paper backdrop-blur-xl', className)}>
      <div className="flex min-w-max items-center gap-2">
        {STEPS.map((step, i) => {
          const isActive = step.key === current;
          const isCompleted = i < currentIndex;

          let href = step.href;
          if (characterId && step.key !== 'gallery') {
            href += `?characterId=${characterId}`;
          }
          if (storyId && step.key === 'generate') {
            href = `/create/generate?storyId=${storyId}`;
          }

          return (
            <div key={step.key} className="flex items-center gap-2">
              <Link
                href={isCompleted || isActive ? href : '#'}
                className={cn(
                  'group flex items-center gap-3 rounded-[22px] px-3 py-2.5 transition-all duration-200',
                  isActive && 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-magic',
                  isCompleted && 'bg-violet-50 text-violet-700 hover:bg-violet-100',
                  !isActive && !isCompleted && 'bg-secondary/90 text-muted-foreground pointer-events-none opacity-70'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold',
                    isActive && 'bg-white/20 text-white',
                    isCompleted && 'bg-white text-violet-700',
                    !isActive && !isCompleted && 'bg-white/60 text-muted-foreground'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : `0${i + 1}`}
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] opacity-70">Step</p>
                  <p className="text-sm font-semibold">{step.label}</p>
                </div>
              </Link>
              {i < STEPS.length - 1 && <div className="h-px w-6 bg-gradient-to-r from-violet-200 to-amber-200" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
