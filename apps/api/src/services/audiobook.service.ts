import { prisma } from '../config/database.js';
import { normalizeStoryboard } from '../types/storyboard.js';
import { generateEdgeTTS, generateEdgeTTSDirect, generateMimoTTS, generateMinimaxTTS } from './tts.service.js';
import { generateClonedVoiceTTS } from './minimax.service.js';
import { getSignedUrl, parseCosKeyFromUrl } from '../config/oss.js';

/**
 * 修复 (2026-06-24): 给 COS URL 加 5-10 分钟的预签名
 * 绕开公有读 + Referer 防盗链限制 — 任何来源 (浏览器/小程序/curl) 都能用,
 * 但链接过期自动失效, 比静态防盗链更安全更易调试
 */
function maybeSignUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const key = parseCosKeyFromUrl(url);
  if (!key) return url; // 不是 COS URL, 不动
  return getSignedUrl(key, 600); // 10 分钟过期
}

export interface AudiobookOptions {
  audioType?: 'tts' | 'mimo' | 'minimax' | 'cloned';
  voiceId?: string;
  voiceName?: string;
  voice?: string;
  force?: boolean;
}

function getSceneAudioText(scene: ReturnType<typeof normalizeStoryboard>['scenes'][number]): string {
  return (scene.voiceover || scene.storyText || '').trim();
}

async function generateSceneTTS(
  userId: string,
  text: string,
  options: AudiobookOptions
): Promise<{ audioUrl: string }> {
  if (options.audioType === 'cloned' && options.voiceId) {
    const userVoice = await prisma.userVoice.findFirst({
      where: { id: options.voiceId, userId, status: 'active' },
    });

    if (!userVoice) {
      throw new Error('Voice not available or not ready');
    }

    return generateClonedVoiceTTS(
      userId,
      userVoice.modelUrl || userVoice.id,
      text,
      options.voiceName
    );
  }

  if (options.audioType === 'mimo') {
    return generateMimoTTS({
      text,
      voice: options.voice || undefined,
    });
  }

  if (options.audioType === 'minimax') {
    return generateMinimaxTTS({
      text,
      voice: options.voice || undefined,
    });
  }

  try {
    return await generateEdgeTTSDirect(text, options.voice || 'zh-CN-XiaoxiaoNeural');
  } catch {
    return generateEdgeTTS({
      text,
      voice: options.voice || 'zh-CN-XiaoxiaoNeural',
    });
  }
}

async function getStoryForAudiobook(storyId: string, userId: string) {
  const story = await prisma.story.findFirst({
    where: { id: storyId, userId },
    include: {
      illustrations: { orderBy: { sceneIndex: 'asc' } },
      sceneAudios: { orderBy: { sceneIndex: 'asc' } },
    },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  return story;
}

export async function getAudiobook(storyId: string, userId: string) {
  const story = await getStoryForAudiobook(storyId, userId);
  const storyboard = normalizeStoryboard(story.scenes, story.title);

  return {
    storyId,
    title: story.title,
    pages: storyboard.scenes.map((scene) => {
      const illustration = story.illustrations.find((item) => item.sceneIndex === scene.index);
      const audio = story.sceneAudios.find((item) => item.sceneIndex === scene.index);

      return {
        sceneIndex: scene.index,
        title: scene.title,
        text: getSceneAudioText(scene),
        subtitle: scene.subtitle,
        imageUrl: illustration?.imageUrl || scene.image?.url || null,
        audioUrl: maybeSignUrl(audio?.audioUrl),
        audioType: audio?.audioType || 'tts',
        voiceId: audio?.voiceId || null,
        status: audio?.status || 'pending',
        errorMessage: audio?.errorMessage || null,
      };
    }),
  };
}

export async function generateAudiobook(storyId: string, userId: string, options: AudiobookOptions = {}) {
  // 修复 (2026-06-24): busy 守卫 — 防止前端 onShow/重复点击 触发并发生成导致重复扣费
  // 任何 scene 还在 processing, 直接返 BUSY, 让前端切到"生成中..."UI 等结果
  if (!options.force) {
    const processing = await prisma.sceneAudio.findFirst({
      where: { storyId, status: 'processing' },
      select: { id: true },
    });
    if (processing) {
      const err = new Error('有声绘本正在生成中,请稍候');
      (err as any).code = 'AUDIOBOOK_BUSY';
      throw err;
    }
  }

  const story = await getStoryForAudiobook(storyId, userId);
  const storyboard = normalizeStoryboard(story.scenes, story.title);

  if (storyboard.scenes.length === 0) {
    throw new Error('Story has no scenes');
  }

  for (const scene of storyboard.scenes) {
    const text = getSceneAudioText(scene);
    if (!text) {
      continue;
    }

    const existing = story.sceneAudios.find((item) => item.sceneIndex === scene.index);
    if (existing?.status === 'completed' && existing.audioUrl && !options.force) {
      continue;
    }

    const record = await prisma.sceneAudio.upsert({
      where: {
        storyId_sceneIndex: {
          storyId,
          sceneIndex: scene.index,
        },
      },
      create: {
        storyId,
        sceneIndex: scene.index,
        text,
        audioType: options.audioType || 'tts',
        voiceId: options.voiceId,
        voiceName: options.voiceName,
        voice: options.voice,
        charCount: text.length,
        status: 'processing',
      },
      update: {
        text,
        audioType: options.audioType || 'tts',
        voiceId: options.voiceId,
        voiceName: options.voiceName,
        voice: options.voice,
        charCount: text.length,
        status: 'processing',
        errorMessage: null,
      },
    });

    try {
      const result = await generateSceneTTS(userId, text, options);
      await prisma.sceneAudio.update({
        where: { id: record.id },
        data: {
          audioUrl: result.audioUrl,
          status: 'completed',
        },
      });
    } catch (error: any) {
      await prisma.sceneAudio.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Failed to generate audio',
        },
      });
      throw error;
    }
  }

  return getAudiobook(storyId, userId);
}

export default {
  getAudiobook,
  generateAudiobook,
};
