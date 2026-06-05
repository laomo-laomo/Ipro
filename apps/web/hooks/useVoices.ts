'use client';

import { useState, useCallback } from 'react';
import type {
  Voice,
  UploadProgress,
  UploadVoiceResponse,
  CloneVoiceResponse,
} from '@/types/voice';
import {
  uploadVoice,
  getVoice,
  getVoices,
  cloneVoice,
  deleteVoice,
} from '@/lib/api/voice';

export interface UseVoicesState {
  // Current voices
  voices: Voice[];

  // Upload state
  isUploading: boolean;
  uploadProgress: UploadProgress | null;
  uploadError: string | null;

  // Clone state
  isCloning: boolean;
  cloneError: string | null;

  // General state
  isLoading: boolean;
  error: string | null;
}

export interface UseVoicesActions {
  // Upload
  uploadAudio: (audio: File) => Promise<UploadVoiceResponse | null>;

  // Voice operations
  loadVoice: (voiceId: string) => Promise<Voice | null>;
  loadVoices: () => Promise<void>;
  removeVoice: (voiceId: string) => Promise<void>;

  // Clone
  clone: (voiceId: string, name: string) => Promise<CloneVoiceResponse | null>;

  // Reset
  reset: () => void;
  resetError: () => void;
}

export function useVoices(): UseVoicesState & UseVoicesActions {
  // State
  const [voices, setVoices] = useState<Voice[]>([]);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Clone state
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // General state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload audio
  const uploadAudio = useCallback(async (audio: File): Promise<UploadVoiceResponse | null> => {
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(null);
    setError(null);

    try {
      const result = await uploadVoice(audio, (progress) => {
        setUploadProgress(progress);
      });

      // Refresh voices list
      const voicesList = await getVoices();
      setVoices(voicesList);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败';
      setUploadError(message);
      setError(message);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Load single voice
  const loadVoice = useCallback(async (voiceId: string): Promise<Voice | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getVoice(voiceId);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load all voices
  const loadVoices = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getVoices();
      setVoices(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete voice
  const removeVoice = useCallback(async (voiceId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await deleteVoice(voiceId);
      setVoices((prev) => prev.filter((v) => v.id !== voiceId));
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clone voice
  const clone = useCallback(async (voiceId: string, name: string): Promise<CloneVoiceResponse | null> => {
    setIsCloning(true);
    setCloneError(null);
    setError(null);

    try {
      const result = await cloneVoice(voiceId, name);

      // Refresh voices list
      const voicesList = await getVoices();
      setVoices(voicesList);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '克隆失败';
      setCloneError(message);
      setError(message);
      return null;
    } finally {
      setIsCloning(false);
    }
  }, []);

  // Reset all state
  const reset = useCallback(() => {
    setVoices([]);
    setIsUploading(false);
    setUploadProgress(null);
    setUploadError(null);
    setIsCloning(false);
    setCloneError(null);
    setIsLoading(false);
    setError(null);
  }, []);

  // Reset error only
  const resetError = useCallback(() => {
    setUploadError(null);
    setCloneError(null);
    setError(null);
  }, []);

  return {
    // State
    voices,
    isUploading,
    uploadProgress,
    uploadError,
    isCloning,
    cloneError,
    isLoading,
    error,

    // Actions
    uploadAudio,
    loadVoice,
    loadVoices,
    removeVoice,
    clone,
    reset,
    resetError,
  };
}