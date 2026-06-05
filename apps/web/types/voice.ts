// Voice types
export type VoiceStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Voice {
  id: string;
  userId: string;
  name: string;
  audioUrl: string;
  status: VoiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UploadVoiceResponse {
  voiceId: string;
  audioUrl: string;
}

export interface CloneVoiceResponse {
  voiceId: string;
  status: VoiceStatus;
}

export interface CloneVoiceRequest {
  voiceId: string;
  name: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Upload progress
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// Voice status display mapping
export const VOICE_STATUS_TEXT: Record<VoiceStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

export const VOICE_STATUS_COLOR: Record<VoiceStatus, string> = {
  pending: 'text-yellow-600',
  processing: 'text-blue-600',
  completed: 'text-green-600',
  failed: 'text-red-600',
};