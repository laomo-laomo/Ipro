// Story types
export type StoryStatus = 'pending' | 'generating' | 'illustrating' | 'rendering' | 'completed' | 'failed';

import type { Storyboard } from './storyboard';

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface StorySegment {
  id: string;
  order: number;
  title: string;
  content: string;
  sceneDesc: string;
  imageUrl?: string;
  imageStatus?: 'pending' | 'generating' | 'completed' | 'failed';
  // Populated when imageStatus === 'failed' — the real reason the AI generation
  // bailed. Prior to this the SceneStatus component fell back to sceneDesc which
  // is the scene's prompt description, not the error — leading to "失败原因:
  // 老虎趴在地上不动..." instead of the actual error from the image provider.
  errorMessage?: string;
}

export interface AudiobookPage {
  sceneIndex: number;
  title: string;
  text: string;
  subtitle?: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioType?: string;
  voiceId?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string | null;
}

export interface Audiobook {
  storyId: string;
  title: string;
  pages: AudiobookPage[];
}

export interface Story {
  id: string;
  userId: string;
  characterId: string;
  title: string;
  templateId?: string;
  templateName?: string;
  status: StoryStatus;
  storyboard: Storyboard;
  segments: StorySegment[];
  videoUrl?: string;
  videoStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  videoDuration?: number | null;
  videoResolution?: string | null;
  videoFileSize?: number | null;
  videoCreatedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateStoryRequest {
  characterId: string;
  templateId?: string;
  templateName?: string;
  customTitle?: string;
}

export interface GenerateStoryResponse {
  storyId: string;
  title: string;
  status: StoryStatus;
}

export interface StoryProgress {
  storyId: string;
  status: StoryStatus;
  currentStep: string;
  progress: number;
  message?: string;
  errorMessage?: string | null;
}

// Template types
export interface StoryTemplate {
  id: string;
  name: string;
  description: string;
  coverImage: string;
  category: string;
}

// Preset templates
export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: 'little-red-riding-hood',
    name: '小红帽',
    description: '经典童话故事，讲述小女孩去探望生病奶奶的冒险旅程',
    coverImage: '/templates/little-red.png',
    category: '经典童话',
  },
  {
    id: 'snow-white',
    name: '白雪公主',
    description: '美丽善良的白雪公主与七个小矮人的故事',
    coverImage: '/templates/snow-white.png',
    category: '经典童话',
  },
  {
    id: 'three-little-pigs',
    name: '三只小猪',
    description: '三只小猪用智慧建造房屋，对抗大灰狼',
    coverImage: '/templates/three-pigs.png',
    category: '经典童话',
  },
  {
    id: 'cinderella',
    name: '灰姑娘',
    description: '善良的灰姑娘在仙女的帮助下获得幸福',
    coverImage: '/templates/cinderella.svg',
    category: '经典童话',
  },
  {
    id: 'sleeping-beauty',
    name: '睡美人',
    description: '被诅咒的公主沉睡百年后被王子唤醒',
    coverImage: '/templates/sleeping-beauty.png',
    category: '经典童话',
  },
  {
    id: 'ugly-duckling',
    name: '丑小鸭',
    description: '一只小鸭子变成美丽天鹅的成长故事',
    coverImage: '/templates/ugly-duckling.png',
    category: '经典童话',
  },
  {
    id: 'pinocchio',
    name: '匹诺曹',
    description: '会说话的木偶匹诺曹变成真正男孩的冒险',
    coverImage: '/templates/pinocchio.png',
    category: '经典童话',
  },
  {
    id: 'beauty-and-beast',
    name: '美女与野兽',
    description: '美女与被诅咒的王子之间的动人故事',
    coverImage: '/templates/beauty-beast.svg',
    category: '经典童话',
  },
];
