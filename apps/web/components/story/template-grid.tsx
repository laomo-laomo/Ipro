'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { STORY_TEMPLATES, type StoryTemplate } from '@/types/story';
import { Check, Sparkles } from 'lucide-react';

export interface TemplateGridProps {
  selectedTemplateId?: string;
  onTemplateSelect: (template: StoryTemplate) => void;
  disabled?: boolean;
  className?: string;
}

const COVER_STYLES: Record<string, string> = {
  'little-red-riding-hood': 'from-rose-300 via-pink-200 to-amber-100',
  'snow-white': 'from-sky-300 via-cyan-100 to-white',
  'three-little-pigs': 'from-orange-300 via-amber-100 to-yellow-50',
  cinderella: 'from-violet-300 via-fuchsia-100 to-pink-50',
  'sleeping-beauty': 'from-purple-300 via-pink-100 to-rose-50',
  'ugly-duckling': 'from-slate-300 via-slate-100 to-white',
  pinocchio: 'from-amber-400 via-orange-200 to-yellow-50',
  'beauty-and-beast': 'from-rose-300 via-amber-100 to-yellow-50',
};

const COVER_ACCENTS: Record<string, string> = {
  'little-red-riding-hood': 'bg-rose-500',
  'snow-white': 'bg-sky-500',
  'three-little-pigs': 'bg-amber-500',
  cinderella: 'bg-violet-500',
  'sleeping-beauty': 'bg-fuchsia-500',
  'ugly-duckling': 'bg-slate-500',
  pinocchio: 'bg-orange-500',
  'beauty-and-beast': 'bg-rose-400',
};

export function TemplateGrid({ selectedTemplateId, onTemplateSelect, disabled = false, className }: TemplateGridProps) {
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

  const templatesByCategory = STORY_TEMPLATES.reduce(
    (acc, template) => {
      if (!acc[template.category]) {
        acc[template.category] = [];
      }
      acc[template.category].push(template);
      return acc;
    },
    {} as Record<string, StoryTemplate[]>
  );

  return (
    <div className={cn('space-y-7', className)}>
      {Object.entries(templatesByCategory).map(([category, templates]) => (
        <div key={category} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <h3 className="text-sm font-semibold tracking-[0.2em] text-violet-700 uppercase">{category}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {templates.map((template) => {
              const isSelected = selectedTemplateId === template.id;
              const isHovered = hoveredTemplate === template.id;
              const coverStyle = COVER_STYLES[template.id] || 'from-violet-300 via-fuchsia-100 to-amber-50';
              const accentStyle = COVER_ACCENTS[template.id] || 'bg-violet-500';

              return (
<button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    onTemplateSelect(template);
                  }}
                  onMouseEnter={() => setHoveredTemplate(template.id)}
                  onMouseLeave={() => setHoveredTemplate(null)}
                  disabled={disabled}
                  className={cn(
                    'group relative overflow-hidden rounded-[28px] p-2 text-left transition-all duration-300 [transform-style:preserve-3d]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected ? 'scale-[1.02] bg-gradient-to-br from-violet-500/30 via-fuchsia-300/25 to-amber-200/30 shadow-magic' : 'bg-white/70 hover:-translate-y-1 hover:shadow-paper hover:[transform:rotateY(-4deg)]',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <div className={cn('relative aspect-[3/4] overflow-hidden rounded-[22px] bg-gradient-to-br p-4', coverStyle)}>
                    <div className="absolute inset-0 opacity-80">
                      <div className="absolute -left-6 top-6 h-24 w-24 rounded-full bg-white/20 blur-xl" />
                      <div className="absolute right-4 top-8 h-14 w-14 rounded-full bg-white/25 blur-md" />
                      <div className="absolute bottom-6 left-6 h-20 w-20 rounded-full bg-white/20 blur-lg" />
                    </div>
                    <div className="relative flex h-full flex-col justify-between rounded-[18px] border border-white/50 bg-white/20 p-4 backdrop-blur-[1px]">
                      <div className="flex items-center justify-between">
                        <span className="w-fit rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-violet-700">AI 封面</span>
                        <Sparkles className="h-4 w-4 text-white/80" />
                      </div>
                      <div className="space-y-4">
                        <div className={cn('h-2 w-14 rounded-full opacity-90', accentStyle)} />
                        <div className={cn('h-2 w-24 rounded-full opacity-80', accentStyle)} />
                        <div className={cn('h-2 w-10 rounded-full opacity-70', accentStyle)} />
                      </div>
                      <div className="rounded-[18px] bg-black/10 p-3 backdrop-blur-[2px]">
                        <p className="text-lg font-bold text-magic-ink line-clamp-1">{template.name}</p>
                        <p className="mt-2 text-xs leading-5 text-magic-ink/75 line-clamp-3">{isHovered ? template.description : '点击选择这本故事，让主角走进童话世界。'}</p>
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
