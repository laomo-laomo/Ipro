'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Story } from '@/types/story';
import {
  getStory,
  getStories,
  deleteStory,
  startIllustration,
  getStoryIllustrations,
  startVideo,
  getStoryVideo,
  retryFailedIllustrations as retryFailedIllustrationsApi,
  retrySingleIllustration as retrySingleIllustrationApi,
} from '@/lib/api/story';
import type { Character } from '@/types/character';
import { mergeIllustrations } from '@/lib/utils/merge-illustrations';

export interface GalleryStory extends Story {
  videoUrl?: string;
  videoStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  illustrationProgress?: number;
}

export interface UseGalleryState {
  stories: GalleryStory[];
  allStories: GalleryStory[];
  story: GalleryStory | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  isLoadingStory: boolean;
  isDeleting: boolean;
  error: string | null;
  storyError: string | null;
  page: number;
  pageSize: number;
  totalStories: number;
  hasMore: boolean;
}

export interface UseGalleryActions {
  loadStories: (page?: number) => Promise<void>;
  loadMoreStories: () => Promise<void>;
  loadStory: (storyId: string) => Promise<void>;
  refreshStory: () => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
  startIllustration: (character?: Character) => Promise<void>;
  refreshIllustrations: () => Promise<void>;
  retryFailedIllustrations: () => Promise<void>;
  retrySingleIllustration: (sceneIndex: number) => Promise<void>;
  startVideo: () => Promise<void>;
  refreshVideo: () => Promise<void>;
  setPage: (page: number) => void;
  reset: () => void;
  resetError: () => void;
}

async function hydrateGalleryStory(storyId: string): Promise<GalleryStory> {
  const result = await getStory(storyId);

  let videoUrl: string | undefined;
  let videoStatus: GalleryStory['videoStatus'] = 'pending';

  try {
    const videoInfo = await getStoryVideo(storyId);
    if (videoInfo) {
      videoUrl = videoInfo.url;
      videoStatus = videoInfo.status as GalleryStory['videoStatus'];
    }
  } catch {
    // Video may not exist yet.
  }

  return {
    ...result,
    videoUrl,
    videoStatus,
  };
}

export function useGallery(): UseGalleryState & UseGalleryActions {
  const [stories, setStories] = useState<GalleryStory[]>([]);
  const [allStories, setAllStories] = useState<GalleryStory[]>([]);
  const [story, setStory] = useState<GalleryStory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingStory, setIsLoadingStory] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [page, setPageState] = useState(1);
  const [pageSize] = useState(12);
  const [totalStories, setTotalStories] = useState(0);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentStoryIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const loadStories = useCallback(async (pageNum: number = 1): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getStories();
      const startIndex = (pageNum - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedStories = result.slice(startIndex, endIndex) as GalleryStory[];

      // Page 1 replaces; pages > 1 would normally append, but loadStories is the entry
      // point for refresh — use loadMoreStories for "加载更多" append behavior.
      setStories(paginatedStories);
      // Keep the full result around so callers can compute total counts (e.g. home tab)
      // without needing to load every page.
      setAllStories(result as GalleryStory[]);
      setTotalStories(result.length);
      setPageState(pageNum);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  const loadMoreStories = useCallback(async (): Promise<void> => {
    if (isLoading || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);

    try {
      const result = await getStories();
      const nextPage = page + 1;
      const startIndex = (nextPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const moreStories = result.slice(startIndex, endIndex) as GalleryStory[];

      // De-dupe by id in case the same story already exists (e.g. after a delete + refetch)
      setStories((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const fresh = moreStories.filter((s) => !existingIds.has(s.id));
        return [...prev, ...fresh];
      });
      setAllStories(result as GalleryStory[]);
      setTotalStories(result.length);
      setPageState(nextPage);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, page, pageSize]);

  const loadStory = useCallback(async (storyId: string): Promise<void> => {
    setIsLoadingStory(true);
    setStoryError(null);
    currentStoryIdRef.current = storyId;

    try {
      const hydratedStory = await hydrateGalleryStory(storyId);
      setStory(hydratedStory);

      if (hydratedStory.status !== 'completed' && hydratedStory.status !== 'failed') {
        stopPolling();
        pollingIntervalRef.current = setInterval(async () => {
          try {
            const nextStory = await hydrateGalleryStory(storyId);
            setStory(nextStory);

            if (nextStory.status === 'completed' || nextStory.status === 'failed') {
              stopPolling();
            }
          } catch (pollError) {
            console.error('轮询失败:', pollError);
          }
        }, 3000);
      } else {
        stopPolling();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setStoryError(message);
    } finally {
      setIsLoadingStory(false);
    }
  }, [stopPolling]);

  const refreshStory = useCallback(async (): Promise<void> => {
    const storyId = story?.id || currentStoryIdRef.current;
    if (storyId) {
      await loadStory(storyId);
    }
  }, [story?.id, loadStory]);

  const deleteStoryFn = useCallback(async (storyId: string): Promise<void> => {
    setIsDeleting(true);
    setError(null);

    try {
      await deleteStory(storyId);
      setStories((prev) => prev.filter((item) => item.id !== storyId));
      setAllStories((prev) => prev.filter((item) => item.id !== storyId));
      if (story?.id === storyId) {
        setStory(null);
      }
      setTotalStories((prev) => Math.max(0, prev - 1));
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      setError(message);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, [story?.id]);

  const refreshIllustrations = useCallback(async (): Promise<void> => {
    if (!story?.id) return;

    try {
      const segments = await getStoryIllustrations(story.id);
      setStory((prev) => prev ? { ...prev, segments: mergeIllustrations(prev.segments, segments) } : null);
    } catch (err) {
      console.error('刷新插画失败:', err);
    }
  }, [story?.id]);

  const retryFailedIllustrations = useCallback(async (): Promise<void> => {
    if (!story?.id) return;

    try {
      await retryFailedIllustrationsApi(story.id);
      await refreshIllustrations();
      await loadStory(story.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : '重试失败';
      setStoryError(message);
    }
  }, [story?.id, refreshIllustrations, loadStory]);

  const retrySingleIllustration = useCallback(async (sceneIndex: number): Promise<void> => {
    if (!story?.id) return;

    try {
      await retrySingleIllustrationApi(story.id, sceneIndex);
      await refreshIllustrations();
    } catch (err) {
      const message = err instanceof Error ? err.message : '重试失败';
      setStoryError(message);
    }
  }, [story?.id, refreshIllustrations]);

  const startIllustrationFn = useCallback(
    async (character?: Character): Promise<void> => {
      if (!story?.id) {
        setStoryError('没有可生成插画的故事');
        return;
      }

      try {
        await startIllustration(story.id, character || {
          id: story.characterId,
          userId: '',
          originalPhotoUrl: '',
          status: 'completed',
          createdAt: '',
          updatedAt: '',
        });
        await loadStory(story.id);
        await refreshIllustrations();
      } catch (err) {
        const message = err instanceof Error ? err.message : '启动插画生成失败';
        setStoryError(message);
      }
    },
    [story?.id, story?.characterId, loadStory, refreshIllustrations]
  );

  const refreshVideo = useCallback(async (): Promise<void> => {
    if (!story?.id) return;

    try {
      const videoInfo = await getStoryVideo(story.id);
      if (videoInfo) {
        setStory((prev) => prev ? {
          ...prev,
          videoUrl: videoInfo.url,
          videoStatus: videoInfo.status as GalleryStory['videoStatus'],
        } : null);
      }
    } catch (err) {
      console.error('刷新视频失败:', err);
    }
  }, [story?.id]);

  const startVideoFn = useCallback(async (): Promise<void> => {
    if (!story?.id) {
      setStoryError('没有可生成视频的故事');
      return;
    }

    try {
      await startVideo(story.id);
      await refreshStory();
    } catch (err) {
      const message = err instanceof Error ? err.message : '启动视频生成失败';
      setStoryError(message);
    }
  }, [story?.id, refreshStory]);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
    loadStories(newPage);
  }, [loadStories]);

  const reset = useCallback(() => {
    setStories([]);
    setStory(null);
    setIsLoading(false);
    setIsLoadingStory(false);
    setIsDeleting(false);
    setError(null);
    setStoryError(null);
    setPageState(1);
    setTotalStories(0);
    stopPolling();
  }, [stopPolling]);

  const resetError = useCallback(() => {
    setError(null);
    setStoryError(null);
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    loadStories(1);
  }, [loadStories]);

  return {
    stories,
    allStories,
    story,
    isLoading,
    isLoadingMore,
    isLoadingStory,
    isDeleting,
    error,
    storyError,
    page,
    pageSize,
    totalStories,
    hasMore: stories.length < totalStories,
    loadStories,
    loadMoreStories,
    loadStory,
    refreshStory,
    deleteStory: deleteStoryFn,
    startIllustration: startIllustrationFn,
    refreshIllustrations,
    retryFailedIllustrations,
    retrySingleIllustration,
    startVideo: startVideoFn,
    refreshVideo,
    setPage,
    reset,
    resetError,
  };
}
