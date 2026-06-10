'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { StyleType } from '@/types/character';
import { Brush, Droplets, Film, Pencil, Shapes, Sparkles, Wand2, Zap } from 'lucide-react';

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

export interface StyleSelectorProps {
  selectedStyle: StyleType;
  onStyleChange: (style: StyleType) => void;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_STYLES = [
  {
    id: 'pixar' as const,
    name: '皮克斯3D',
    description: '圆润立体，像动画电影主角',
  },
  {
    id: 'ghibli' as const,
    name: '宫崎骏风',
    description: '梦幻唯美，像会呼吸的森林',
  },
  {
    id: 'clay' as const,
    name: '橡皮泥风',
    description: '软萌质感，像手工定格动画',
  },
  {
    id: 'handdrawn' as const,
    name: '手绘风格',
    description: '温柔柔和，像睡前图画书',
  },
];

export function StyleSelector({ selectedStyle, onStyleChange, disabled = false, className }: StyleSelectorProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-4 sm:grid-cols-4', className)}>
      {DEFAULT_STYLES.map((style) => {
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
              <Image src={STYLE_IMAGES[style.id]} alt={style.name} fill className="object-cover opacity-95 mix-blend-multiply" sizes="(min-width:640px) 25vw, 50vw" />
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
    </div>
  );
}
