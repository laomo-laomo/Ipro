'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Story,
  StoryProgress,
  StorySegment,
  GenerateStoryResponse,
} from '@/types/story';
import type { Storyboard } from '@/types/storyboard';
import type { Character } from '@/types/character';
import { mergeIllustrations } from '@/lib/utils/merge-illustrations';
import {
  generateStory,
  getStory,
  getStoryProgress,
  updateStorySegments,
  updateSegment,
  getStories,
  deleteStory,
  startIllustration,
  getStoryIllustrations,
} from '@/lib/api/story';

export interface UseStoryState {
  story: Story | null;
  stories: Story[];
  isGenerating: boolean;
  generationError: string | null;
  isLoading: boolean;
  error: string | null;
  progress: StoryProgress | null;
  isPolling: boolean;
}

export interface UseStoryActions {
  generateFromTemplate: (
    characterId: string,
    templateId: string,
    templateName: string
  ) => Promise<GenerateStoryResponse | null>;
  generateFromCustomTitle: (
    characterId: string,
    customTitle: string
  ) => Promise<GenerateStoryResponse | null>;
  loadStory: (storyId: string) => Promise<void>;
  loadStories: () => Promise<void>;
  removeStory: (storyId: string) => Promise<void>;
  editSegments: (segments: StorySegment[]) => Promise<void>;
  editSegment: (segmentId: string, updates: Partial<StorySegment>) => Promise<void>;
  startIllustration: (character: Character, options?: { force?: boolean }) => Promise<void>;
  refreshIllustrations: () => Promise<void>;
  startProgressPolling: (storyId: string) => void;
  stopProgressPolling: () => void;
  reset: () => void;
  resetError: () => void;
}

function createStoryShell(result: GenerateStoryResponse, characterId: string, extra?: Partial<Story>): Story {
  const defaultStoryboard: Storyboard = {
    version: 1,
    title: result.title,
    scenes: [],
  };

  return {
    id: result.storyId,
    userId: '',
    characterId,
    title: result.title,
    status: result.status,
    storyboard: defaultStoryboard,
    segments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

export function useStory(): UseStoryState & UseStoryActions {
  const [story, setStory] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateFromTemplate = useCallback(
    async (
      characterId: string,
      templateId: string,
      templateName: string
    ): Promise<GenerateStoryResponse | null> => {
      setIsGenerating(true);
      setGenerationError(null);
      setError(null);

      try {
        const result = await generateStory({
          characterId,
          templateId,
          templateName,
        });

        setStory(createStoryShell(result, characterId, {
          templateId,
          templateName,
        }));

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : '鐢熸垚鏁呬簨澶辫触';
        setGenerationError(message);
        setError(message);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const generateFromCustomTitle = useCallback(
    async (
      characterId: string,
      customTitle: string
    ): Promise<GenerateStoryResponse | null> => {
      setIsGenerating(true);
      setGenerationError(null);
      setError(null);

      try {
        const result = await generateStory({ characterId, customTitle });
        setStory(createStoryShell(result, characterId));
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : '鐢熸垚鏁呬簨澶辫触';
        setGenerationError(message);
        setError(message);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const loadStory = useCallback(async (storyId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getStory(storyId);
      setStory(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '鍔犺浇澶辫触';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadStories = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getStories();
      setStories(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '鍔犺浇澶辫触';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeStory = useCallback(async (storyId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await deleteStory(storyId);
      setStories((prev) => prev.filter((item) => item.id !== storyId));
      if (story?.id === storyId) {
        setStory(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '鍒犻櫎澶辫触';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [story?.id]);

  const editSegments = useCallback(
    async (segments: StorySegment[]): Promise<void> => {
      if (!story?.id) {
        setError('娌℃湁鍙紪杈戠殑鏁呬簨');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await updateStorySegments(story.id, segments);
        setStory(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : '鏇存柊澶辫触';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [story?.id]
  );

  const editSegment = useCallback(
    async (segmentId: string, updates: Partial<StorySegment>): Promise<void> => {
      if (!story?.id) {
        setError('娌℃湁鍙紪杈戠殑鏁呬簨');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await updateSegment(story.id, segmentId, updates);
        setStory(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : '鏇存柊澶辫触';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [story?.id]
  );

  const refreshIllustrations = useCallback(async (): Promise<void> => {
    if (!story?.id) return;

    try {
      const segments = await getStoryIllustrations(story.id);
      setStory((prev) => prev ? { ...prev, segments: mergeIllustrations(prev.segments, segments) } : null);
    } catch (err) {
      console.error('鍒锋柊鎻掔敾澶辫触:', err);
    }
  }, [story?.id]);

  const startIllustrationFn = useCallback(
    async (character: Character, options?: { force?: boolean }): Promise<void> => {
      if (!story?.id) {
        setError('娌℃湁鍙敓鎴愭彃鐢荤殑鏁呬簨');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await startIllustration(story.id, character, options);
        await loadStory(story.id);
        await refreshIllustrations();
      } catch (err) {
        const message = err instanceof Error ? err.message : '鍚姩鎻掔敾鐢熸垚澶辫触';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [story?.id, loadStory, refreshIllustrations]
  );

  const stopProgressPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startProgressPolling = useCallback((storyId: string) => {
    stopProgressPolling();
    setIsPolling(true);

    const poll = async () => {
      try {
        const progressData = await getStoryProgress(storyId);
        setProgress(progressData);

        if (progressData.status === 'completed' || progressData.status === 'failed') {
          stopProgressPolling();
          await loadStory(storyId);
          await refreshIllustrations();
        }
      } catch (err) {
        console.error('杞杩涘害澶辫触:', err);
      }
    };

    poll();
    pollingIntervalRef.current = setInterval(poll, 3000);
  }, [loadStory, refreshIllustrations, stopProgressPolling]);

  const reset = useCallback(() => {
    setStory(null);
    setStories([]);
    setIsGenerating(false);
    setGenerationError(null);
    setIsLoading(false);
    setError(null);
    setProgress(null);
    stopProgressPolling();
  }, [stopProgressPolling]);

  const resetError = useCallback(() => {
    setGenerationError(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    story,
    stories,
    isGenerating,
    generationError,
    isLoading,
    error,
    progress,
    isPolling,
    generateFromTemplate,
    generateFromCustomTitle,
    loadStory,
    loadStories,
    removeStory,
    editSegments,
    editSegment,
    startIllustration: startIllustrationFn,
    refreshIllustrations,
    startProgressPolling,
    stopProgressPolling,
    reset,
    resetError,
  };
}
