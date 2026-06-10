// Character types
export type CharacterStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Preset style keys recognized by the AI service. The list is extended
// (4 → 8) in the style-library rollout; see STYLE_OPTIONS below for the
// user-facing picker labels and preview thumbnails.
export type StyleType =
  | 'pixar'
  | 'ghibli'
  | 'clay'
  | 'handdrawn'
  | 'watercolor'
  | 'paper'
  | 'comic'
  | 'papercut';

// A user-defined custom style. Mirrors the AI service CustomStylePrompt +
// the CustomStyle DB row shape so the StyleLibrary UI can render user
// tiles with the same accent / icon metadata.
export interface CustomStylePrompt {
  prompt: string;
  id: string;
  name: string;
  colorTheme: string;
  iconName: string;
}

// Style field accepted by the API. Either a preset key (string) or a custom
// style object loaded from the CustomStyle table. The shape matches the
// server-side zod union exactly.
export type StyleInput = StyleType | CustomStylePrompt;

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
  // Preset enum OR a custom user-defined style. The orchestrator-style
  // shape is preserved end-to-end through the API and AI service.
  style: StyleInput;
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
  {
    id: 'watercolor',
    name: '水彩风',
    description: '水彩风，流动的色彩，纸面晕染',
    previewImage: '/styles/watercolor.svg',
  },
  {
    id: 'paper',
    name: '折纸风',
    description: '折纸风格，几何切面，低多边形质感',
    previewImage: '/styles/paper.svg',
  },
  {
    id: 'comic',
    name: '漫画风',
    description: '美式漫画，粗线条，网点阴影',
    previewImage: '/styles/comic.svg',
  },
  {
    id: 'papercut',
    name: '剪纸风',
    description: '中国剪纸/皮影风，平面色块，装饰纹样',
    previewImage: '/styles/papercut.svg',
  },
];

