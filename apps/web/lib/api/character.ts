import type {
  Character,
  UploadCharacterResponse,
  StylizeCharacterRequest,
  StylizeCharacterResponse,
  ApiResponse,
  UploadProgress,
} from '@/types/character';
import { API_BASE, authHeaders, jsonHeaders, resolveAssetUrl } from './client';

interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function seedDevCharacter(): Promise<UploadCharacterResponse & { stylizedPhotoUrl?: string; featureDesc?: string }> {
  const response = await fetch(`${API_BASE}/api/characters/dev-seed`, {
    method: 'POST',
    headers: jsonHeaders(),
    credentials: 'include',
  });

  const result: ApiResponse<UploadCharacterResponse & { stylizedPhotoUrl?: string; featureDesc?: string }> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '创建测试角色失败');
  }

  return {
    ...result.data!,
    originalPhotoUrl: resolveAssetUrl(result.data!.originalPhotoUrl) || result.data!.originalPhotoUrl,
    stylizedPhotoUrl: resolveAssetUrl(result.data!.stylizedPhotoUrl),
  };
}

/**
 * Upload photo to create a character
 */
export async function uploadCharacter(
  photo: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadCharacterResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('photo', photo);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response: ApiResponse<UploadCharacterResponse> = JSON.parse(xhr.responseText);
          if (response.success) {
            resolve(normalizeUploadResponse(response.data!));
          } else {
            reject(new Error(response.message || '上传失败'));
          }
        } catch {
          reject(new Error('解析响应失败'));
        }
      } else {
        reject(new Error(`上传失败: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('网络错误'));
    });

    xhr.open('POST', `${API_BASE}/api/characters/upload`);
    const tokenHeaders = authHeaders();
    if (tokenHeaders.Authorization) {
      xhr.setRequestHeader('Authorization', tokenHeaders.Authorization);
    }
    xhr.send(formData);
  });
}

/**
 * Get character by ID
 */
export async function getCharacter(characterId: string): Promise<Character> {
  const response = await fetch(`${API_BASE}/api/characters/${characterId}`, {
    method: 'GET',
    headers: jsonHeaders(),
    credentials: 'include',
  });

  const result: ApiResponse<Character> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取角色失败');
  }
  return normalizeCharacter(result.data!);
}

/**
 * Get user's characters list
 */
export async function getCharacters(): Promise<Character[]> {
  const response = await fetch(`${API_BASE}/api/characters`, {
    method: 'GET',
    headers: jsonHeaders(),
    credentials: 'include',
  });

  const result: ApiResponse<Character[]> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取角色列表失败');
  }
  return (result.data || []).map(normalizeCharacter);
}

/**
 * Stylize character with selected style
 */
export async function stylizeCharacter(
  characterId: string,
  params: StylizeCharacterRequest & { title?: string }
): Promise<StylizeCharacterResponse> {
  const response = await fetch(`${API_BASE}/api/characters/${characterId}/stylize`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(params),
    credentials: 'include',
  });

  const result: ApiResponse<StylizeCharacterResponse> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '风格化失败');
  }
  return normalizeStylizeResponse(result.data!);
}

function normalizeCharacter(character: Character): Character {
  return {
    ...character,
    originalPhotoUrl: resolveAssetUrl(character.originalPhotoUrl) || character.originalPhotoUrl,
    stylizedPhotoUrl: resolveAssetUrl(character.stylizedPhotoUrl),
  };
}

function normalizeUploadResponse(response: UploadCharacterResponse): UploadCharacterResponse {
  return {
    ...response,
    originalPhotoUrl: resolveAssetUrl(response.originalPhotoUrl) || response.originalPhotoUrl,
  };
}

function normalizeStylizeResponse(response: StylizeCharacterResponse): StylizeCharacterResponse {
  return {
    ...response,
    stylizedPhotoUrl: resolveAssetUrl(response.stylizedPhotoUrl) || response.stylizedPhotoUrl,
  };
}

/**
 * Delete character
 */
export async function deleteCharacter(characterId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/characters/${characterId}`, {
    method: 'DELETE',
    headers: jsonHeaders(),
    credentials: 'include',
  });

  const result: ApiResponse<void> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '删除失败');
  }
}

/**
 * Upload photo using fetch API (alternative method)
 */
export async function uploadCharacterFetch(
  photo: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadCharacterResponse> {
  const formData = new FormData();
  formData.append('photo', photo);

  const response = await fetch(`${API_BASE}/api/characters/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
    credentials: 'include',
  });

  const result: ApiResponse<UploadCharacterResponse> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '上传失败');
  }
  return normalizeUploadResponse(result.data!);
}

