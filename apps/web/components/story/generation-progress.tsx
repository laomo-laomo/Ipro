'use client';

import { cn } from '@/lib/utils';
import type { StoryProgress, StoryStatus } from '@/types/story';
import { AlertCircle, Check, FileText, Image, Loader2, Sparkles, Video } from 'lucide-react';

export interface GenerationProgressProps {
  progress: StoryProgress | null;
  isPolling?: boolean;
  onRetry?: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; description: string; icon: React.ElementType }> = {
  pending: {
    label: '等待中',
    description: '魔法书正在翻到第一页',
    icon: Loader2,
  },
  generating: {
    label: '生成故事',
    description: 'AI 正在为你编写情节',
    icon: FileText,
  },
  illustrating: {
    label: '生成插画',
    description: '正在为每一页绘制画面',
    icon: Image,
  },
  rendering: {
    label: '渲染视频',
    description: '正在拼接成完整故事影片',
    icon: Video,
  },
  completed: {
    label: '已完成',
    description: '你的绘本已经完成',
    icon: Check,
  },
  failed: {
    label: '失败',
    description: '生成过程中出现错误',
    icon: AlertCircle,
  },
};

const STEPS: StoryStatus[] = ['generating', 'illustrating', 'rendering', 'completed'];

function getStepProgress(status: StoryStatus, progress: number): number {
  const statusIndex = STEPS.indexOf(status);
  if (statusIndex === -1) return 0;

  const baseProgress = (statusIndex / (STEPS.length - 1)) * 100;
  const stepWeight = 100 / (STEPS.length - 1);
  const currentStepProgress = (progress / 100) * stepWeight;

  return Math.min(baseProgress + currentStepProgress, 100);
}

export function GenerationProgress({ progress, isPolling = false, onRetry, className }: GenerationProgressProps) {
  if (!progress) {
    return (
      <div className={cn('rounded-[30px] border border-white/70 bg-white/80 p-8 text-center shadow-paper backdrop-blur-xl', className)}>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">正在读取创作进度...</p>
      </div>
    );
  }

  const config = STATUS_CONFIG[progress.status] ?? { label: '处理中', description: progress.message || '正在处理...', icon: Loader2 };
  const Icon = config.icon;
  const overallProgress = getStepProgress(progress.status, progress.progress);

  return (
    <div className={cn('space-y-6 rounded-[30px] border border-white/70 bg-white/82 p-6 shadow-paper backdrop-blur-xl', className)}>
      <div className="rounded-[24px] bg-gradient-to-r from-violet-50 via-rose-50 to-amber-50 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', progress.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-white text-violet-600')}>
              <Icon className={cn('h-5 w-5', progress.status !== 'completed' && progress.status !== 'failed' && 'animate-pulse')} />
            </div>
            <div>
              <p className="text-sm font-medium text-violet-700">AI 创作中</p>
              <h3 className="text-xl font-bold">{config.label}</h3>
            </div>
          </div>
          <span className="text-2xl font-extrabold text-violet-700">{progress.progress}%</span>
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/70">
          <div
            className={cn('h-full rounded-full transition-all duration-500', progress.status === 'failed' ? 'bg-destructive' : 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400')}
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{progress.message || config.description}</p>
      </div>

      <div className="grid gap-3">
        {STEPS.map((step, index) => {
          const stepConfig = STATUS_CONFIG[step];
          const StepIcon = stepConfig.icon;
          const isCurrent = step === progress.status;
          const isCompleted = STEPS.indexOf(progress.status) > index;
          const isPending = STEPS.indexOf(progress.status) < index;

          return (
            <div
              key={step}
              className={cn(
                'flex items-center gap-4 rounded-[22px] border p-4 transition-all',
                isCurrent && 'border-violet-300 bg-violet-50/90',
                isCompleted && 'border-emerald-200 bg-emerald-50/80',
                isPending && 'border-border bg-secondary/60'
              )}
            >
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full',
                  isCurrent && 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white',
                  isCompleted && 'bg-emerald-100 text-emerald-600',
                  isPending && 'bg-white text-muted-foreground'
                )}
              >
                {isCurrent ? <Loader2 className="h-4 w-4 animate-spin" /> : isCompleted ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <p className={cn('text-sm font-semibold', isPending && 'text-muted-foreground')}>{stepConfig.label}</p>
                <p className="text-xs text-muted-foreground">{stepConfig.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {isPolling && progress.status !== 'completed' && progress.status !== 'failed' && (
        <div className="flex items-center justify-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-medium text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          实时追踪魔法进度中...
        </div>
      )}
    </div>
  );
}

export function GenerationProgressCompact({ progress, className }: GenerationProgressProps) {
  if (!progress) return null;

  const config = STATUS_CONFIG[progress.status] ?? { label: '处理中', description: progress.message || '正在处理...', icon: Loader2 };
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Icon className={cn('h-4 w-4', progress.status === 'failed' ? 'text-destructive' : 'text-primary', progress.status !== 'completed' && progress.status !== 'failed' && 'animate-spin')} />
      <span className="text-sm">
        {config.label} {progress.progress}%
      </span>
    </div>
  );
}
