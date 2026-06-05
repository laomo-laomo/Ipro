'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Clock, Image as ImageIcon, Play, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from '@/lib/utils/date';
import type { Story, StoryStatus } from '@/types/story';

interface IllustrationCardProps {
  story: Story;
  onDelete?: (storyId: string) => void;
}

export function IllustrationCard({ story, onDelete }: IllustrationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const coverImage = story.segments.find((segment) => segment.imageUrl)?.imageUrl;
  const illustrationCount = story.segments.filter((segment) => segment.imageUrl).length;
  // Check actual videoUrl, not story.status — after the mapStoryStatus fix, "completed"
  // covers both illustrated-only books and fully-videofied books, so status alone is ambiguous.
  const hasVideo = Boolean((story as { videoUrl?: string }).videoUrl);

  // 获取故事内容预览 - 优先使用 content，其次 sceneDesc
  const getStoryPreview = () => {
    if (story.segments[0]?.content) return story.segments[0].content;
    if (story.segments[0]?.sceneDesc) return story.segments[0].sceneDesc;
    return null;
  };
  const storyPreview = getStoryPreview();

  const getStatusLabel = (status: StoryStatus): string => {
    const labels: Record<StoryStatus, string> = {
      pending: '等待中',
      generating: '生成中',
      illustrating: '绘制中',
      rendering: '渲染中',
      completed: '已完成',
      failed: '失败',
    };
    return labels[status];
  };

  const getStatusColor = (status: StoryStatus): string => {
    const colors: Record<StoryStatus, string> = {
      pending: 'bg-slate-100/90 text-slate-600',
      generating: 'bg-sky-100/90 text-sky-700',
      illustrating: 'bg-amber-100/90 text-amber-700',
      rendering: 'bg-violet-100/90 text-violet-700',
      completed: 'bg-emerald-100/90 text-emerald-700',
      failed: 'bg-rose-100/90 text-rose-700',
    };
    return colors[status];
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除这个作品吗？删除后无法恢复。')) return;
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(story.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="group relative overflow-hidden rounded-[32px] border border-white/60 bg-gradient-to-b from-white/95 to-white/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl"
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <Link href={`/gallery/${story.id}`} className="block">
        {/* 封面图片区域 */}
        <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-violet-200/50 via-fuchsia-100/30 to-amber-100/40">
          {coverImage ? (
            <img
              src={coverImage}
              alt={story.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-violet-300/60">
              <BookOpen className="h-16 w-16" />
              <span className="mt-3 text-sm">等待插画生成</span>
            </div>
          )}

          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
          
          {/* 状态标签 */}
          <div className="absolute left-4 top-4">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-sm ${getStatusColor(story.status)}`}>
              {getStatusLabel(story.status)}
            </span>
          </div>

          {/* 视频标签 */}
          {hasVideo && (
            <div className="absolute right-4 top-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-lg backdrop-blur-sm">
                <Video className="h-3.5 w-3.5" />
                含视频
              </span>
            </div>
          )}

          {/* 悬停播放按钮 */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-2xl backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
              <Play className="ml-1 h-6 w-6 text-violet-600" />
            </div>
          </div>
        </div>
      </Link>

      {/* 删除按钮 */}
      {showDelete && onDelete && (
        <div className="absolute right-4 top-44 z-10">
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 rounded-full bg-white/95 shadow-lg backdrop-blur-sm hover:bg-white"
            onClick={(event) => {
              event.preventDefault();
              handleDelete();
            }}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
          </Button>
        </div>
      )}

      {/* 内容区域 */}
      <div className="p-5">
        {/* 标题 */}
        <Link href={`/gallery/${story.id}`}>
          <h3 className="text-xl font-bold text-gray-800 line-clamp-1 transition-colors hover:text-rose-500">
            {story.title}
          </h3>
        </Link>

        {/* 故事内容预览 - 绘本风格居中 */}
        {storyPreview && (
          <div className="relative mt-6 overflow-hidden rounded-2xl">
            {/* 渐变背景 */}
            <div className="absolute inset-0 bg-gradient-to-br from-rose-50/60 via-white/80 to-amber-50/40" />
            
            {/* 内容区域 */}
            <div className="relative p-6">
              {/* 场景标题 */}
              <h4 className="mb-4 text-center text-xl font-bold text-rose-500">
                {story.segments[0]?.title || '开场'}
              </h4>
              
              {/* 故事文字 */}
              <div className="relative">
                <div className="absolute -left-2 top-0 text-4xl font-serif text-rose-200/50">&ldquo;</div>
                <div className="absolute -right-2 bottom-0 rotate-180 text-4xl font-serif text-rose-200/50">&ldquo;</div>
                
                <p className="relative z-10 text-center text-base leading-8 text-gray-700 line-clamp-3">
                  {storyPreview}
                </p>
              </div>
              
              {/* 装饰分隔线 */}
              <div className="mt-4 flex items-center justify-center gap-3">
                <div className="h-px w-10 bg-gradient-to-r from-transparent to-rose-300" />
                <div className="h-1.5 w-1.5 rotate-45 bg-rose-300" />
                <div className="h-px w-10 bg-gradient-to-l from-transparent to-rose-300" />
              </div>
            </div>
          </div>
        )}

        {/* 底部信息栏 */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-600">
              <ImageIcon className="h-3.5 w-3.5" />
              {illustrationCount}张
            </span>
            {story.templateName && (
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600">
                {story.templateName}
              </span>
            )}
          </div>
        </div>
        
        {/* 幕数指示 */}
        {story.segments.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {story.segments.slice(0, Math.min(story.segments.length, 5)).map((_, idx) => (
              <div key={idx} className="h-1.5 w-1.5 rounded-full bg-rose-300/60" />
            ))}
            {story.segments.length > 5 && (
              <span className="text-xs text-gray-400">+{story.segments.length - 5}</span>
            )}
          </div>
        )}
        
        {/* 时间 */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(story.createdAt)}
        </div>
      </div>
    </div>
  );
}
