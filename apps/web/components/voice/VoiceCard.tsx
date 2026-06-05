'use client';

import { useState } from 'react';
import { Copy, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoicePlayer } from './VoicePlayer';
import type { Voice } from '@/types/voice';
import { VOICE_STATUS_COLOR, VOICE_STATUS_TEXT } from '@/types/voice';
import { cn } from '@/lib/utils';

export interface VoiceCardProps {
  voice: Voice;
  onDelete?: (voiceId: string) => void;
  onClone?: (voiceId: string) => void;
  isCloning?: boolean;
  isDeleting?: boolean;
  className?: string;
}

export function VoiceCard({ voice, onDelete, onClone, isCloning = false, isDeleting = false, className }: VoiceCardProps) {
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneName, setCloneName] = useState(voice.name);

  const handleClone = () => {
    if (onClone) {
      onClone(voice.id);
      setShowCloneDialog(false);
    }
  };

  const handleDelete = () => {
    if (onDelete && confirm('确定要删除这个声音吗？')) {
      onDelete(voice.id);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={cn('rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-sm', className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold">{voice.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">创建于 {formatDate(voice.createdAt)}</p>
        </div>
        <div className={cn('rounded-full px-3 py-1 text-xs font-medium', VOICE_STATUS_COLOR[voice.status], voice.status === 'pending' && 'bg-yellow-100', voice.status === 'processing' && 'bg-blue-100', voice.status === 'completed' && 'bg-green-100', voice.status === 'failed' && 'bg-red-100')}>
          {VOICE_STATUS_TEXT[voice.status]}
        </div>
      </div>

      {voice.audioUrl && voice.status === 'completed' && (
        <div className="mb-4 rounded-[20px] bg-secondary/60 p-3">
          <VoicePlayer audioUrl={voice.audioUrl} />
        </div>
      )}

      {voice.status === 'processing' && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2 text-sm">处理中...</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/80 pt-4">
        {voice.status === 'completed' && (
          <Button variant="outline" size="sm" onClick={() => setShowCloneDialog(!showCloneDialog)} disabled={isCloning} className="rounded-full">
            <Copy className="h-4 w-4" />
            克隆音色
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleDelete} disabled={isDeleting} className="rounded-full text-destructive hover:text-destructive">
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          删除
        </Button>
      </div>

      {showCloneDialog && (
        <div className="mt-4 rounded-[22px] bg-amber-50/70 p-4">
          <label className="block text-xs font-semibold tracking-[0.16em] text-amber-700 uppercase mb-2">克隆后的声音名称</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder="输入名称"
              className="flex-1 rounded-2xl border border-input bg-white px-3 py-2 text-sm"
            />
            <Button size="sm" onClick={handleClone} disabled={isCloning} className="rounded-full" variant="magic">
              {isCloning ? <Loader2 className="h-4 w-4 animate-spin" /> : '确认克隆'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">克隆音色需要支付费用，具体价格请查看费用说明。</p>
        </div>
      )}
    </div>
  );
}
