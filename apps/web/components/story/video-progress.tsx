'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  Check,
  Loader2,
  Music,
  Play,
  RefreshCw,
  Video,
} from 'lucide-react';

export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface VideoProgressData {
  videoId?: string;
  status: VideoStatus;
  progress: number;
  stage?: 'idle' | 'audio_generating' | 'audio_done' | 'rendering' | 'video_done' | 'completed';
  message?: string;
  videoUrl?: string;
  errorMessage?: string;
}

interface VideoProgressProps {
  data: VideoProgressData;
  isPolling?: boolean;
  onRetry?: () => Promise<void>;
  onPlay?: () => void;
  className?: string;
}

interface StageInfo {
  label: string;
  description: string;
  icon: React.ElementType;
  minProgress: number;
  maxProgress: number;
  estimatedSeconds: number;
}

const STAGES: StageInfo[] = [
  {
    label: '准备音频',
    description: '正在合成故事配音',
    icon: Music,
    minProgress: 0,
    maxProgress: 10,
    estimatedSeconds: 30,
  },
  {
    label: '音频生成',
    description: '音频文件处理中',
    icon: Music,
    minProgress: 10,
    maxProgress: 40,
    estimatedSeconds: 60,
  },
  {
    label: '视频渲染',
    description: '正在拼接动画场景',
    icon: Video,
    minProgress: 40,
    maxProgress: 90,
    estimatedSeconds: 180,
  },
  {
    label: '生成完成',
    description: '视频处理完成',
    icon: Check,
    minProgress: 90,
    maxProgress: 100,
    estimatedSeconds: 30,
  },
];

function getCurrentStage(progress: number): StageInfo | null {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (progress >= STAGES[i].minProgress) {
      return STAGES[i];
    }
  }
  return STAGES[0];
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) {
    return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
}

function getStageProgress(data: VideoProgressData): number {
  const stage = getCurrentStage(data.progress);
  if (!stage) return data.progress;

  const stageRange = stage.maxProgress - stage.minProgress;
  const progressInStage = data.progress - stage.minProgress;
  return Math.round((progressInStage / stageRange) * 100);
}

function getEstimatedRemaining(data: VideoProgressData): string {
  const stage = getCurrentStage(data.progress);
  if (!stage) return '计算中...';

  const stageRange = stage.maxProgress - stage.minProgress;
  const progressInStage = data.progress - stage.minProgress;

  if (progressInStage <= 0) {
    return `约 ${formatTime(stage.estimatedSeconds)}`;
  }

  const progressRatio = progressInStage / stageRange;
  const estimatedTotal = stage.estimatedSeconds / progressRatio;
  const remaining = Math.max(10, Math.round(estimatedTotal - stage.estimatedSeconds * progressRatio));

  return `约 ${formatTime(remaining)}`;
}

export function VideoProgress({
  data,
  isPolling = false,
  onRetry,
  onPlay,
  className,
}: VideoProgressProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const currentStage = getCurrentStage(data.progress);
  const stageProgress = getStageProgress(data);
  const estimatedRemaining = getEstimatedRemaining(data);
  const isProcessing = data.status === 'processing' || data.status === 'pending';
  const isCompleted = data.status === 'completed';
  const isFailed = data.status === 'failed';

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handlePlay = () => {
    if (onPlay) {
      onPlay();
    } else if (data.videoUrl) {
      window.open(data.videoUrl, '_blank');
    }
  };

  if (data.status === 'pending' && data.progress === 0) {
    return (
      <div className={cn('rounded-[24px] border border-slate-200 bg-slate-50/50 p-6 text-center', className)}>
        <Video className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm text-muted-foreground">视频尚未生成</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-violet-600" />
          <h3 className="text-lg font-bold">视频生成</h3>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{data.progress}%</span>
          <span className="font-bold text-violet-700">{currentStage?.label || '准备中'}</span>
        </div>
      </div>

      {/* Main progress area */}
      <div
        className={cn(
          'rounded-2xl border p-5 transition-all',
          isCompleted && 'border-emerald-200 bg-emerald-50/50',
          isProcessing && 'border-amber-200 bg-amber-50/50',
          isFailed && 'border-rose-200 bg-rose-50/50',
          !isCompleted && !isProcessing && !isFailed && 'border-slate-200 bg-slate-50/50'
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                isCompleted && 'bg-emerald-100 text-emerald-600',
                isProcessing && 'bg-amber-100 text-amber-600',
                isFailed && 'bg-rose-100 text-rose-600',
                !isCompleted && !isProcessing && !isFailed && 'bg-slate-100 text-slate-500'
              )}
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isCompleted ? (
                <Check className="h-5 w-5" />
              ) : isFailed ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <Video className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-violet-700">AI 渲染中</p>
              <h4 className="text-lg font-bold">{currentStage?.label || '准备中'}</h4>
              {data.message && (
                <p className="text-xs text-muted-foreground">{data.message}</p>
              )}
            </div>
          </div>
          <span className="text-2xl font-extrabold text-violet-700">{data.progress}%</span>
        </div>

        {/* Stage progress bar */}
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/70">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isFailed ? 'bg-rose-500' : 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400'
            )}
            style={{ width: `${data.progress}%` }}
          />
        </div>

        {/* Time estimate */}
        {(isProcessing || data.progress > 0) && !isFailed && (
          <p className="mt-3 text-sm text-muted-foreground">
            {isProcessing ? `预计还需 ${estimatedRemaining}` : '处理中...'}
          </p>
        )}

        {/* Error message */}
        {isFailed && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3">
            <p className="text-sm font-medium text-rose-700">生成失败</p>
            <p className="mt-1 text-xs text-rose-600">
              {data.errorMessage || '视频生成过程中出现错误，请重试'}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex gap-3">
          {isCompleted && data.videoUrl && (
            <Button
              className="flex-1 rounded-full"
              onClick={handlePlay}
            >
              <Play className="h-4 w-4" />
              播放视频
            </Button>
          )}

          {isFailed && onRetry && (
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              重试生成
            </Button>
          )}
        </div>
      </div>

      {/* Stage steps */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, index) => {
          const StageIcon = stage.icon;
          const isStageComplete = data.progress > stage.maxProgress;
          const isStageActive = data.progress >= stage.minProgress && data.progress <= stage.maxProgress;
          const isStagePending = data.progress < stage.minProgress;

          return (
            <div
              key={stage.label}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all',
                isStageComplete && 'border-emerald-200 bg-emerald-50/50',
                isStageActive && 'border-amber-200 bg-amber-50/50',
                isStagePending && 'border-slate-200 bg-slate-50/50'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  isStageComplete && 'bg-emerald-100 text-emerald-600',
                  isStageActive && 'bg-amber-100 text-amber-600',
                  isStagePending && 'bg-slate-100 text-slate-400'
                )}
              >
                {isStageActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isStageComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <StageIcon className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className={cn('text-sm font-medium', isStagePending && 'text-muted-foreground')}>
                  {stage.label}
                </p>
                <p className="text-xs text-muted-foreground">{stage.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Polling indicator */}
      {isPolling && isProcessing && (
        <div className="flex items-center justify-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-medium text-violet-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          实时追踪渲染进度中...
        </div>
      )}
    </div>
  );
}

export function VideoProgressCompact({
  data,
  className,
}: {
  data: VideoProgressData;
  className?: string;
}) {
  const Icon = data.status === 'processing' ? Loader2 : data.status === 'failed' ? AlertCircle : Check;
  const statusColor = data.status === 'processing' ? 'text-amber-600' : data.status === 'failed' ? 'text-rose-600' : 'text-emerald-600';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Icon className={cn('h-4 w-4', statusColor, data.status === 'processing' && 'animate-spin')} />
      <span className="text-sm">
        {data.status === 'processing' ? '视频生成中...' : data.status === 'failed' ? '视频生成失败' : '视频已完成'}
      </span>
    </div>
  );
}