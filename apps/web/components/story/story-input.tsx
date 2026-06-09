'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2 } from 'lucide-react';

export interface StoryInputProps {
  onGenerate: (customTitle: string) => void;
  isGenerating?: boolean;
  disabled?: boolean;
  className?: string;
}

export function StoryInput({ onGenerate, isGenerating = false, disabled = false, className }: StoryInputProps) {
  const [customTitle, setCustomTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const trimmed = customTitle.trim();
      if (!trimmed) {
        setError('请输入童话故事名称');
        return;
      }

      if (trimmed.length < 2) {
        setError('故事名称至少需要 2 个字符');
        return;
      }

      if (trimmed.length > 50) {
        setError('故事名称不能超过 50 个字符');
        return;
      }

      setError(null);
      onGenerate(trimmed);
    },
    [customTitle, onGenerate]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomTitle(e.target.value);
      if (error) setError(null);
    },
    [error]
  );

  return (
    <div className={cn('rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-paper backdrop-blur-xl md:rounded-[30px] md:p-6', className)}>
      <div className="mb-5">
        <p className="text-sm font-medium text-amber-600">自定义故事</p>
        <h3 className="mt-1 text-xl font-bold md:text-2xl">给这本故事起个名字</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">例如“小明的太空冒险”或“月亮森林里的秘密派对”，AI 会围绕这个名字延展完整剧情。</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Wand2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500" />
          <input
            type="text"
            value={customTitle}
            onChange={handleChange}
            disabled={disabled || isGenerating}
            placeholder="例如：小兔子的云朵城堡"
            maxLength={50}
            className={cn(
              'flex h-14 w-full rounded-[20px] border border-input bg-background/80 pl-12 pr-4 text-sm',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-destructive focus-visible:ring-destructive'
            )}
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" disabled={disabled || isGenerating || !customTitle.trim()} className="w-full rounded-full" variant="magic" size="lg">
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              开始生成故事
            </>
          )}
        </Button>
      </form>

      <div className="mt-5 rounded-[22px] bg-amber-50/80 p-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-700 uppercase">灵感提示</p>
        <ul className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">
          <li>可以写主角、场景、情节关键词，比如“海底”“勇气”“寻找宝藏”。</li>
          <li>名字越有画面感，生成的故事越容易呈现出鲜明的节奏和氛围。</li>
        </ul>
      </div>
    </div>
  );
}
