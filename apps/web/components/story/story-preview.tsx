'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Story, StorySegment } from '@/types/story';
import type { StoryboardScene } from '@/types/storyboard';
import { Edit2, Image as ImageIcon, Save, Sparkles, X } from 'lucide-react';

export interface StoryPreviewProps {
  story: Story;
  onSegmentsChange?: (segments: StorySegment[]) => void;
  onStartIllustration?: () => void;
  isSaving?: boolean;
  isIllustrating?: boolean;
  className?: string;
}

export function StoryPreview({
  story,
  onSegmentsChange,
  isSaving = false,
  className,
}: StoryPreviewProps) {
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const storyboardScenes = story.storyboard.scenes;

  const sceneBySegmentId = useCallback((segment: StorySegment): StoryboardScene | undefined => {
    return storyboardScenes.find((scene) => scene.id === segment.id || scene.index === segment.order - 1);
  }, [storyboardScenes]);

  const handleEditStart = useCallback((segment: StorySegment) => {
    setEditingSegmentId(segment.id);
    const scene = sceneBySegmentId(segment);
    setEditContent((prev) => ({ ...prev, [segment.id]: scene?.storyText || segment.content }));
  }, [sceneBySegmentId]);

  const handleEditCancel = useCallback((segmentId: string) => {
    setEditingSegmentId(null);
    setEditContent((prev) => {
      const next = { ...prev };
      delete next[segmentId];
      return next;
    });
  }, []);

  const handleEditChange = useCallback((segmentId: string, value: string) => {
    setEditContent((prev) => ({ ...prev, [segmentId]: value }));
  }, []);

  const handleEditSave = useCallback((segmentId: string) => {
    const newContent = editContent[segmentId];
    if (!newContent || !onSegmentsChange) return;

    const updatedSegments = story.segments.map((segment) =>
      segment.id === segmentId ? { ...segment, content: newContent } : segment
    );
    onSegmentsChange(updatedSegments);
    setEditingSegmentId(null);
    setEditContent((prev) => {
      const next = { ...prev };
      delete next[segmentId];
      return next;
    });
  }, [editContent, onSegmentsChange, story.segments]);

  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-violet-700">故事预览</p>
        <h2 className="text-3xl font-bold">{story.title}</h2>
        {story.templateName && <p className="text-sm text-muted-foreground">基于「{story.templateName}」模板生成</p>}
      </div>

      <div className="space-y-5">
        {story.segments.map((segment) => {
          const isEditing = editingSegmentId === segment.id;
          const scene = sceneBySegmentId(segment);
          const currentContent = editContent[segment.id] ?? scene?.storyText ?? segment.content;
          const sceneTitle = scene?.title || segment.title;
          const sceneDescription = scene?.imageDescription || segment.sceneDesc;
          const imageUrl = scene?.image?.url || segment.imageUrl;

          return (
            <div key={segment.id} className="mx-auto max-w-3xl overflow-hidden rounded-[30px] border border-white/70 bg-white/82 shadow-paper">
              <div className="flex items-center justify-between border-b border-border/70 bg-gradient-to-r from-violet-50 to-amber-50 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white shadow-sm">
                    {segment.order}
                  </span>
                  <div>
                    <p className="text-sm font-bold">{sceneTitle}</p>
                    {sceneDescription && <p className="text-xs text-muted-foreground">{sceneDescription}</p>}
                  </div>
                </div>
                {onSegmentsChange && !isEditing && (
                  <Button variant="ghost" size="sm" onClick={() => handleEditStart(segment)} className="rounded-full">
                    <Edit2 className="h-4 w-4" />
                    编辑
                  </Button>
                )}
              </div>

              <div className="grid gap-0 md:grid-cols-[240px_1fr]">
                <div className="relative min-h-[220px] bg-gradient-to-br from-violet-100 to-amber-50">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={sceneTitle}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-violet-300">
                      <ImageIcon className="h-12 w-12" />
                    </div>
                  )}
                </div>

                <div className="p-5">
                  {isEditing ? (
                    <div className="space-y-3">
                      <textarea
                        value={currentContent}
                        onChange={(event) => handleEditChange(segment.id, event.target.value)}
                        rows={7}
                        className="w-full rounded-[20px] border border-input bg-background/80 px-4 py-3 text-sm leading-7 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEditCancel(segment.id)} className="rounded-full">
                          <X className="h-4 w-4" />
                          取消
                        </Button>
                        <Button size="sm" onClick={() => handleEditSave(segment.id)} disabled={isSaving} className="rounded-full" variant="magic">
                          <Save className="h-4 w-4" />
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-8 text-foreground/80">{scene?.storyText || segment.content}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {story.segments.every((segment) => segment.imageStatus === 'completed' && segment.imageUrl) && (
        <div className="flex items-center justify-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-medium text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
          所有插画已生成完成
        </div>
      )}
    </div>
  );
}
