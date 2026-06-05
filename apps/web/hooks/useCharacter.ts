'use client';

import { useState, useCallback } from 'react';
import type {
  Character,
  StyleType,
  UploadProgress,
  UploadCharacterResponse,
  StylizeCharacterResponse,
} from '@/types/character';
import {
  uploadCharacter,
  getCharacter,
  getCharacters,
  stylizeCharacter,
  deleteCharacter,
  seedDevCharacter,
} from '@/lib/api/character';

export interface UseCharacterState {
  character: Character | null;
  characters: Character[];
  isUploading: boolean;
  uploadProgress: UploadProgress | null;
  uploadError: string | null;
  isStylizing: boolean;
  stylizeError: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseCharacterActions {
  uploadPhoto: (photo: File) => Promise<UploadCharacterResponse | null>;
  createDevCharacter: () => Promise<UploadCharacterResponse | null>;
  loadCharacter: (characterId: string) => Promise<void>;
  loadCharacters: () => Promise<void>;
  removeCharacter: (characterId: string) => Promise<void>;
  stylize: (style: StyleType, title?: string) => Promise<StylizeCharacterResponse | null>;
  reset: () => void;
  resetError: () => void;
}

export function useCharacter(): UseCharacterState & UseCharacterActions {
  const [character, setCharacter] = useState<Character | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isStylizing, setIsStylizing] = useState(false);
  const [stylizeError, setStylizeError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPhoto = useCallback(async (photo: File): Promise<UploadCharacterResponse | null> => {
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(null);
    setError(null);

    try {
      const result = await uploadCharacter(photo, (progress) => {
        setUploadProgress(progress);
      });

      setCharacter({
        id: result.characterId,
        userId: '',
        originalPhotoUrl: result.originalPhotoUrl,
        featureDesc: result.featureDesc,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

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

  const createDevCharacter = useCallback(async (): Promise<UploadCharacterResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await seedDevCharacter();
      setCharacter({
        id: result.characterId,
        userId: '',
        originalPhotoUrl: result.originalPhotoUrl,
        stylizedPhotoUrl: (result as any).stylizedPhotoUrl,
        featureDesc: (result as any).featureDesc,
        status: 'completed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建测试角色失败';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCharacter = useCallback(async (characterId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    // Reset stylized state to avoid showing stale results when switching characters
    setCharacter(null);

    try {
      const result = await getCharacter(characterId);
      setCharacter(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCharacters = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getCharacters();
      setCharacters(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeCharacter = useCallback(async (characterId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await deleteCharacter(characterId);
      setCharacters((prev) => prev.filter((item) => item.id !== characterId));
      if (character?.id === characterId) {
        setCharacter(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [character]);

const stylize = useCallback(async (style: StyleType, title?: string): Promise<StylizeCharacterResponse | null> => {
    if (!character?.id) {
      setStylizeError('没有可风格化的角色');
      return null;
    }

    setIsStylizing(true);
    setStylizeError(null);
    setError(null);

    let result: StylizeCharacterResponse | null = null;
    try {
      result = await stylizeCharacter(character.id, { style, title });
      setCharacter((prev) => prev ? {
        ...prev,
        stylizedPhotoUrl: result!.stylizedPhotoUrl,
        status: result!.status,
        updatedAt: new Date().toISOString(),
      } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '风格化失败';
      setStylizeError(message);
      setError(message);
      result = null;
    } finally {
      setIsStylizing(false);
    }

    return result;
  }, [character?.id]);

  const reset = useCallback(() => {
    setCharacter(null);
    setCharacters([]);
    setIsUploading(false);
    setUploadProgress(null);
    setUploadError(null);
    setIsStylizing(false);
    setStylizeError(null);
    setIsLoading(false);
    setError(null);
  }, []);

  const resetError = useCallback(() => {
    setUploadError(null);
    setStylizeError(null);
    setError(null);
  }, []);

  return {
    character,
    characters,
    isUploading,
    uploadProgress,
    uploadError,
    isStylizing,
    stylizeError,
    isLoading,
    error,
    uploadPhoto,
    createDevCharacter,
    loadCharacter,
    loadCharacters,
    removeCharacter,
    stylize,
    reset,
    resetError,
  };
}
