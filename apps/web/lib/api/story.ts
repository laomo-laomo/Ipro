import type {
  Story,
  StoryStatus,
  GenerateStoryRequest,
  GenerateStoryResponse,
  StoryProgress,
  Audiobook,
  ApiResponse,
  StorySegment,
} from '@/types/story';
import type { Storyboard, StoryboardScene } from '@/types/storyboard';
import type { Character } from '@/types/character';
import { API_BASE, jsonHeaders, resolveAssetUrl } from './client';

interface ApiStoryScene {
  id?: string;
  index?: number;
  title?: string;
  titleEn?: string;
  charactersInScene?: string[];
  storyText?: string;
  storyTextEn?: string;
  imageDescription?: string;
  imageDescriptionEn?: string;
  imagePrompt?: string;
  charactersLayout?: string;
  dialogue?: any[];
  narration?: any;
  voiceover?: string;
  voiceoverEn?: string;
  subtitle?: string;
  shot?: Record<string, unknown>;
  durationSec?: number;
  musicMood?: string;
  sfx?: string[];
  image?: {
    prompt?: string;
    originalPrompt?: string;
    url?: string | null;
    status?: string;
    retryCount?: number;
    failureCategory?: string | null;
    errorMessage?: string | null;
    cost?: number;
  };
  description?: string;
  descriptionEn?: string;
  sceneDesc?: string;
  text?: string;
  textEn?: string;
  content?: string;
}

interface ApiIllustration {
  id?: string;
  sceneIndex: number;
  description?: string;
  text?: string;
  imageUrl?: string | null;
  status?: string;
  errorMessage?: string | null;
  failureCategory?: string | null;
}

interface ApiStory extends Omit<Partial<Story>, 'segments' | 'status'> {
  id: string;
  title: string;
  userId: string;
  status?: string;
  storyboard?: Storyboard;
  scenes?: ApiStoryScene[];
  segments?: Story['segments'];
  illustrations?: ApiIllustration[];
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

function createDefaultStoryboard(title: string): Storyboard {
  return {
    version: 1,
    title,
    scenes: [],
  };
}

function mapImageStatus(status?: string): Story['segments'][number]['imageStatus'] {
  switch (status) {
    case 'processing':
      return 'generating';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function normalizeStoryboardScene(scene: any, index: number): StoryboardScene {
  return {
    id: scene?.id || `scene-${index}`,
    index: typeof scene?.index === 'number' ? scene.index : index,
    title: scene?.title || `第 ${index + 1} 幕`,
    titleEn: scene?.titleEn,
    charactersInScene: Array.isArray(scene?.charactersInScene) ? scene.charactersInScene : [],
    storyText: scene?.storyText || scene?.text || scene?.content || scene?.voiceover || '',
    storyTextEn: scene?.storyTextEn || scene?.textEn || '',
    imageDescription: scene?.imageDescription || scene?.description || scene?.sceneDesc || scene?.title || `第 ${index + 1} 幕`,
    imageDescriptionEn: scene?.imageDescriptionEn || scene?.descriptionEn || '',
    imagePrompt: scene?.imagePrompt,
    charactersLayout: scene?.charactersLayout,
    dialogue: Array.isArray(scene?.dialogue) ? scene.dialogue : [],
    narration: scene?.narration,
    voiceover: scene?.voiceover || scene?.storyText || scene?.text || scene?.content || '',
    voiceoverEn: scene?.voiceoverEn || scene?.storyTextEn || scene?.textEn || '',
    subtitle: scene?.subtitle,
    shot: scene?.shot,
    durationSec: scene?.durationSec,
    musicMood: scene?.musicMood,
    sfx: Array.isArray(scene?.sfx) ? scene.sfx : [],
    image: scene?.image ? {
      ...scene.image,
      url: resolveAssetUrl(scene.image.url) || scene.image.url,
      status: scene.image.status,
    } : undefined,
  };
}

function normalizeStoryboard(story: ApiStory): Storyboard {
  if (story.storyboard?.version === 1) {
    return {
      ...story.storyboard,
      title: story.storyboard.title || story.title,
      scenes: (story.storyboard.scenes || []).map(normalizeStoryboardScene),
    };
  }

  return {
    ...createDefaultStoryboard(story.title),
    scenes: (story.scenes || []).map(normalizeStoryboardScene),
  };
}

function mapStoryStatus(status?: string): StoryStatus {
  switch (status) {
    case 'draft':
      return 'generating';
    case 'processing':
      return 'illustrating';
    // Backend sets `illustrated` as a TERMINAL state when every scene's illustration
    // has finished generating. Mapping it to `illustrating` (绘制中) made finished
    // books look like they were still being drawn — fix is to surface as completed.
    case 'illustrated':
      return 'completed';
    case 'rendering':
      return 'rendering';
    case 'published':
      return 'completed';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function normalizeStory(story: ApiStory): Story {
  const storyboard = normalizeStoryboard(story);
  const scenes = story.segments || storyboard.scenes.map((scene, index) => {
    const order = typeof scene.index === 'number' ? scene.index + 1 : index + 1;
    const illustration = story.illustrations?.find((item) => item.sceneIndex === scene.index);

    // Prefer the Illustration ROW's status/url over the storyboard JSON. The row
    // is the source of truth (written transactionally with the actual image
    // upload result), while the storyboard JSON can lag behind — e.g. a retry
    // succeeds and writes row='completed' but the storyboard 'image.status' is
    // still 'failed' from the previous attempt. Using the storyboard first led
    // to UI showing "重试" buttons for scenes that were actually already done;
    // clicking them then 400'd with "already completed".
    const rowStatus = illustration?.status;
    const rowImageUrl = illustration?.imageUrl;
    const rowErrorMessage = illustration?.errorMessage;

    // Defensive: if the illustration row OR the storyboard scene already has a
    // CDN URL, the image was generated successfully — promote to 'completed'
    // even if the row.status is stale or the storyboard image.status lags
    // (which happens when the AI service writes the row transactionally but
    // never back-fills scenes[].image.status). Without this, the page falls
    // back to the storyboard's null/undefined → 'pending' or 'failed' and
    // shows a 7-card "生成失败" wall even though all 7 URLs are real.
    const resolvedImageUrl = resolveAssetUrl(rowImageUrl ?? scene.image?.url);
    const fallbackStatus = mapImageStatus(rowStatus ?? scene.image?.status);
    const finalStatus = resolvedImageUrl && !fallbackStatus?.startsWith('completed')
      ? 'completed'
      : fallbackStatus;

    return {
      id: scene.id || `segment-${order - 1}`,
      order,
      title: scene.title || `第 ${order} 幕`,
      content: scene.storyText || scene.voiceover || '',
      sceneDesc: scene.imageDescription || '',
      imageUrl: resolvedImageUrl,
      imageStatus: finalStatus,
      // Surface the row's error message to the UI; the storyboard's image.errorMessage
      // is kept for backward compat but the row is more reliable.
      errorMessage: rowErrorMessage || scene.image?.errorMessage || undefined,
    };
  });

  // API includes the latest Video row (take: 1) on list responses. Pull its url/status
  // up to top-level so the gallery card "含视频" badge can show without a second call.
  const latestVideo = (story as ApiStory & { videos?: Array<{ videoUrl?: string | null; status?: string }> }).videos?.[0];
  const videoUrl = latestVideo?.videoUrl ? resolveAssetUrl(latestVideo.videoUrl) : undefined;

  return {
    id: story.id,
    userId: story.userId,
    characterId: story.characterId || '',
    title: story.title,
    templateId: story.templateId,
    templateName: story.templateName,
    status: mapStoryStatus(story.status),
    storyboard,
    segments: scenes,
    ...(videoUrl ? { videoUrl } : {}),
    errorMessage: story.errorMessage || null,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  } as Story;
}

function normalizeGeneratedStory(
  data: GenerateStoryResponse & { status?: string }
): GenerateStoryResponse {
  return {
    ...data,
    status: mapStoryStatus(data.status),
  };
}

export async function generateStory(
  params: GenerateStoryRequest
): Promise<GenerateStoryResponse> {
  const response = await fetch(`${API_BASE}/api/stories/create`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(params),
  });

  const result: ApiResponse<GenerateStoryResponse> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '生成故事失败');
  }
  return normalizeGeneratedStory(result.data!);
}

export async function getStory(storyId: string): Promise<Story> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<ApiStory> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取故事失败');
  }
  return normalizeStory(result.data!);
}

export async function getStoryProgress(storyId: string): Promise<StoryProgress> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/progress`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<StoryProgress> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取进度失败');
  }
  return {
    ...result.data!,
    status: mapStoryStatus(result.data?.status),
  };
}

export async function updateStorySegments(
  storyId: string,
  segments: Story['segments']
): Promise<Story> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/segments`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ segments }),
  });

  const result: ApiResponse<ApiStory> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '更新故事失败');
  }
  return normalizeStory(result.data!);
}

export async function updateSegment(
  storyId: string,
  segmentId: string,
  updates: Partial<Story['segments'][0]>
): Promise<Story> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/segments/${segmentId}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(updates),
  });

  const result: ApiResponse<ApiStory> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '更新段落失败');
  }
  return normalizeStory(result.data!);
}

export async function getStories(): Promise<Story[]> {
  const response = await fetch(`${API_BASE}/api/stories`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<ApiStory[]> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取故事列表失败');
  }
  return (result.data || []).map(normalizeStory);
}

export async function deleteStory(storyId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}`, {
    method: 'DELETE',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<void> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '删除失败');
  }
}

export async function generateStoryWithLLM(
  characterId: string,
  customTitle: string
): Promise<GenerateStoryResponse> {
  return generateStory({
    characterId,
    customTitle,
  });
}

export async function startIllustration(
  storyId: string,
  character: Character,
  options?: { force?: boolean }
): Promise<{ jobId: string }> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/illustrate`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ characterId: character.id, force: options?.force ?? false }),
  });

  const result: ApiResponse<{ jobId: string }> = await response.json();
  console.log('[startIllustration] response:', response.status, result);
  if (!result.success) {
    throw new Error(result.message || '启动插画生成失败');
  }
  return result.data!;
}

export async function getStoryIllustrations(
  storyId: string
): Promise<Story['segments']> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/illustrations`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<ApiIllustration[]> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取插画失败');
  }
  return (result.data || []).map((illustration) => {
    const order = illustration.sceneIndex + 1;

    return {
      id: illustration.id || `segment-${illustration.sceneIndex}`,
      order,
      title: `第 ${order} 幕`,
      content: illustration.text || '',
      sceneDesc: illustration.description || '',
      imageUrl: resolveAssetUrl(illustration.imageUrl),
      imageStatus: mapImageStatus(illustration.status),
    };
  });
}

export async function startVideo(
  storyId: string,
  body?: { audioType?: 'tts' | 'mimo' | 'minimax' | 'cloned'; voiceName?: string; voice?: string; voiceId?: string }
): Promise<{ jobId: string | null; videoId: string; videoUrl?: string }> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/video`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body || {}),
  });

  const result: ApiResponse<{
    jobId: string | null;
    videoId: string;
    videoUrl?: string;
    audioUrl?: string;
    duration?: number;
    resolution?: string;
    fileSize?: number;
    status: string;
  }> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '启动视频生成失败');
  }
  return result.data!;
}

function normalizeAudiobook(data: Audiobook): Audiobook {
  return {
    ...data,
    pages: (data.pages || []).map((page) => ({
      ...page,
      imageUrl: resolveAssetUrl(page.imageUrl),
      audioUrl: resolveAssetUrl(page.audioUrl),
    })),
  };
}

export async function getAudiobook(storyId: string): Promise<Audiobook | null> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/audiobook`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  if (response.status === 404) {
    return null;
  }

  const result: ApiResponse<Audiobook> = await response.json();
  if (!result.success || !result.data) {
    return null;
  }

  return normalizeAudiobook(result.data);
}

export interface GenerateAudiobookOptions {
  audioType?: 'tts' | 'mimo' | 'minimax' | 'cloned';
  voice?: string;
  voiceId?: string;
  voiceName?: string;
}

export async function generateAudiobook(
  storyId: string,
  options: GenerateAudiobookOptions = {}
): Promise<Audiobook> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/audiobook`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(options),
  });

  const result: ApiResponse<Audiobook> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.message || '生成有声绘本失败');
  }

  return normalizeAudiobook(result.data);
}

export async function retryFailedIllustrations(
  storyId: string
): Promise<{ retriedCount: number; failedCount: number }> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/illustrations/retry-failed`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: '{}',
  });

  const result: ApiResponse<{ retriedCount: number; failedCount: number }> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '重试插画失败');
  }
  return result.data!;
}

export async function retrySingleIllustration(
  storyId: string,
  sceneIndex: number
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/illustrations/${sceneIndex}/retry`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: '{}',
  });

  const result: ApiResponse<void> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '重试插画失败');
  }
}

export interface RegenerateAllResult {
  storyId: string;
  totalScenes: number;
  queuedCount: number;
  jobIds: string[];
  queuePosition: number;
  estimatedTime: string;
  message: string;
}

/**
 * Re-generate EVERY illustration for a story with the latest prompt
 * (e.g. after hardening textOnImage so the caption bakes into the artwork).
 * Resets all Illustration rows to pending and queues a fresh task per scene.
 * Idempotent — safe to call again if a previous run was interrupted.
 */
export async function regenerateAllIllustrations(
  storyId: string
): Promise<RegenerateAllResult> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/regenerate-illustrations`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: '{}',
  });

  const result: ApiResponse<RegenerateAllResult> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.message || '重新生成绘本失败');
  }
  return result.data;
}

export async function getStoryVideo(storyId: string): Promise<{
  url?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl?: string | null;
  audioType?: string | null;
  duration?: number | null;
  resolution?: string | null;
  fileSize?: number | null;
  createdAt?: string | null;
} | null> {
  const response = await fetch(`${API_BASE}/api/stories/${storyId}/video`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  if (response.status === 404) {
    return null;
  }

  const result: ApiResponse<{
    videoUrl?: string | null;
    url?: string | null;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    audioUrl?: string | null;
    audioType?: string | null;
    duration?: number | null;
    resolution?: string | null;
    fileSize?: number | null;
    createdAt?: string | null;
  }> = await response.json();
  if (!result.success || !result.data) {
    return null;
  }

  const url = resolveAssetUrl(result.data.videoUrl || result.data.url);

  return {
    url,
    status: result.data.status,
    audioUrl: resolveAssetUrl(result.data.audioUrl) || result.data.audioUrl,
    audioType: result.data.audioType,
    duration: result.data.duration,
    resolution: result.data.resolution,
    fileSize: result.data.fileSize,
    createdAt: result.data.createdAt,
  };
}

