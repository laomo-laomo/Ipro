// Character types
export type CharacterStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type StyleType = 'pixar' | 'ghibli' | 'clay' | 'handdrawn';

export interface Character {
  id: string;
  userId: string;
  originalPhotoUrl: string;
  stylizedPhotoUrl?: string;
  featureDesc?: string;
  status: CharacterStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UploadCharacterResponse {
  characterId: string;
  originalPhotoUrl: string;
  featureDesc?: string;
}

export interface StylizeCharacterRequest {
  style: StyleType;
}

export interface StylizeCharacterResponse {
  characterId: string;
  stylizedPhotoUrl: string;
  status: CharacterStatus;
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

// Style option for selector
export interface StyleOption {
  id: StyleType;
  name: string;
  description: string;
  previewImage: string;
}

export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'pixar',
    name: '皮克斯3D',
    description: '皮克斯动画风格，圆润立体',
    previewImage: '/styles/pixar.svg',
  },
  {
    id: 'ghibli',
    name: '宫崎骏风',
    description: '日系动画风格，梦幻唯美',
    previewImage: '/styles/ghibli.svg',
  },
  {
    id: 'clay',
    name: '橡皮泥风',
    description: '黏土定格动画风格，Q萌可爱',
    previewImage: '/styles/clay.svg',
  },
  {
    id: 'handdrawn',
    name: '手绘风格',
    description: '细腻手绘插画，柔和温暖',
    previewImage: '/styles/handdrawn.svg',
  },
];

