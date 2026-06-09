import type {
  Voice,
  UploadVoiceResponse,
  CloneVoiceResponse,
  ApiResponse,
  UploadProgress,
} from '@/types/voice';
import { API_BASE, authHeaders, jsonHeaders } from './client';

interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Upload audio to create a voice
 */
export async function uploadVoice(
  audio: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadVoiceResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('audio', audio);

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
          const response: ApiResponse<UploadVoiceResponse> = JSON.parse(xhr.responseText);
          if (response.success) {
            resolve(response.data!);
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

    xhr.open('POST', `${API_BASE}/api/voices/upload`);
    xhr.withCredentials = true;
    const tokenHeaders = authHeaders();
    if (tokenHeaders.Authorization) {
      xhr.setRequestHeader('Authorization', tokenHeaders.Authorization);
    }
    xhr.send(formData);
  });
}

/**
 * Get user's voices list
 */
export async function getVoices(): Promise<Voice[]> {
  const response = await fetch(`${API_BASE}/api/voices`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<Voice[]> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取声音列表失败');
  }
  return result.data || [];
}

/**
 * Get voice by ID
 */
export async function getVoice(voiceId: string): Promise<Voice> {
  const response = await fetch(`${API_BASE}/api/voices/${voiceId}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<Voice> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取声音失败');
  }
  return result.data!;
}

/**
 * Clone voice
 */
export async function cloneVoice(
  voiceId: string,
  name: string
): Promise<CloneVoiceResponse> {
  const response = await fetch(`${API_BASE}/api/voices/${voiceId}/clone`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ name }),
  });

  const result: ApiResponse<CloneVoiceResponse> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '克隆失败');
  }
  return result.data!;
}

/**
 * Delete voice
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/voices/${voiceId}`, {
    method: 'DELETE',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<void> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '删除失败');
  }
}

