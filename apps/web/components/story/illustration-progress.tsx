'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { StorySegment } from '@/types/story';
import {
  AlertCircle,
  Check,
  Image,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export type ImageStatus = 'pending' | 'generating' | 'completed' | 'failed';

interface IllustrationProgressProps {
  segments: StorySegment[];
  isPolling?: boolean;
  onRetryScene?: (sceneIndex: number) => Promise<void>;
  onRetryAllFailed?: () => Promise<void>;
  className?: string;
}

interface SceneStatusProps {
  segment: StorySegment;
  index: number;
  onRetry?: () => Promise<void>;
  isRetrying?: boolean;
}

const STATUS_CONFIG: Record<ImageStatus, { label: string; icon: React.ElementType; color: string }> = {
  pending: {
    label: '等待中',
    icon: Image,
    color: 'text-slate-500 bg-slate-100',
  },
  generating: {
    label: '生成中',
    icon: Loader2,
    color: 'text-amber-600 bg-amber-100',
  },
  completed: {
    label: '已完成',
    icon: Check,
    color: 'text-emerald-600 bg-emerald-100',
  },
  failed: {
    label: '生成失败',
    icon: AlertCircle,
    color: 'text-rose-600 bg-rose-100',
  },
};

function getImageStatus(segment: StorySegment): ImageStatus {
  return segment.imageStatus || 'pending';
}

function SceneStatus({ segment, index, onRetry, isRetrying }: SceneStatusProps) {
  const status = getImageStatus(segment);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  // Prefer segment.errorMessage (the real failure reason from the image provider);
  // fall back to sceneDesc only as a last resort so the box never goes empty.
  const hasError = status === 'failed' && (segment.errorMessage || segment.sceneDesc);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-4 transition-all',
        status === 'completed' && 'border-emerald-200 bg-emerald-50/50',
        status === 'generating' && 'border-amber-200 bg-amber-50/50',
        status === 'failed' && 'border-rose-200 bg-rose-50/50',
        status === 'pending' && 'border-slate-200 bg-slate-50/50'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', config.color)}>
            <Icon className={cn('h-4 w-4', status === 'generating' && 'animate-spin')} />
          </div>
          <div>
            <p className="text-sm font-medium">第 {index + 1} 页</p>
            <p className="text-xs text-muted-foreground">{config.label}</p>
          </div>
        </div>

        {status === 'failed' && onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            重试
          </Button>
        )}
      </div>

      {hasError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
          <p className="font-medium">失败原因：</p>
          <p className="mt-1 break-words">{segment.errorMessage || segment.sceneDesc}</p>
        </div>
      )}

      {status === 'completed' && segment.imageUrl && (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
          <img
            src={segment.imageUrl}
            alt={segment.title || `第 ${index + 1} 页`}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
}

export function IllustrationProgress({
  segments,
  isPolling = false,
  onRetryScene,
  onRetryAllFailed,
  className,
}: IllustrationProgressProps) {
  const [retryingIndex, setRetryingIndex] = useState<number | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const totalScenes = segments.length;
  const completedCount = segments.filter((s) => getImageStatus(s) === 'completed').length;
  const failedCount = segments.filter((s) => getImageStatus(s) === 'failed').length;
  const generatingCount = segments.filter((s) => getImageStatus(s) === 'generating').length;
  const progress = totalScenes > 0 ? Math.round((completedCount / totalScenes) * 100) : 0;

  const handleRetryScene = async (index: number) => {
    if (!onRetryScene) return;
    setRetryingIndex(index);
    try {
      await onRetryScene(index);
    } finally {
      setRetryingIndex(null);
    }
  };

  const handleRetryAllFailed = async () => {
    if (!onRetryAllFailed) return;
    setRetryingAll(true);
    try {
      await onRetryAllFailed();
    } finally {
      setRetryingAll(false);
    }
  };

  if (totalScenes === 0) {
    return (
      <div className={cn('rounded-[24px] border border-slate-200 bg-slate-50/50 p-6 text-center', className)}>
        <Image />
        <p className="mt-2 text-sm text-muted-foreground">暂无插画内容</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          <h3 className="text-lg font-bold">插画生成</h3>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {completedCount}/{totalScenes} 完成
          </span>
          <span className="font-bold text-violet-700">{progress}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Scene grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {segments.map((segment, index) => (
          <SceneStatus
            key={segment.id || index}
            segment={segment}
            index={index}
            onRetry={onRetryScene ? () => handleRetryScene(index) : undefined}
            isRetrying={retryingIndex === index}
          />
        ))}
      </div>

      {/* Failed actions */}
      {failedCount > 0 && onRetryAllFailed && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span className="text-sm text-rose-700">
              有 {failedCount} 个插画生成失败
            </span>
          </div>
          <Button
            variant="outline"
            className="rounded-full border-rose-300 text-rose-700 hover:bg-rose-100"
            onClick={handleRetryAllFailed}
            disabled={retryingAll}
          >
            {retryingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            全部重试
          </Button>
        </div>
      )}

      {/* Polling indicator */}
      {isPolling && generatingCount > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-medium text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          实时追踪生成进度中...
        </div>
      )}
    </div>
  );
}

export function IllustrationProgressCompact({
  segments,
  className,
}: {
  segments: StorySegment[];
  className?: string;
}) {
  const totalScenes = segments.length;
  const completedCount = segments.filter((s) => getImageStatus(s) === 'completed').length;
  const failedCount = segments.filter((s) => getImageStatus(s) === 'failed').length;
  const generatingCount = segments.filter((s) => getImageStatus(s) === 'generating').length;

  const Icon = generatingCount > 0 ? Loader2 : failedCount > 0 ? AlertCircle : Check;
  const statusColor = generatingCount > 0 ? 'text-amber-600' : failedCount > 0 ? 'text-rose-600' : 'text-emerald-600';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Icon className={cn('h-4 w-4', statusColor, generatingCount > 0 && 'animate-spin')} />
      <span className="text-sm">
        插画 {completedCount}/{totalScenes}
      </span>
    </div>
  );
}