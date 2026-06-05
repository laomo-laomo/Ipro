import { prisma } from '../config/database.js';
import { normalizeStoryboard } from '../types/storyboard.js';
import { generateEdgeTTS, generateEdgeTTSDirect, generateMimoTTS, generateMinimaxTTS } from './tts.service.js';
import { generateClonedVoiceTTS } from './minimax.service.js';

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
        audioUrl: audio?.audioUrl || null,
        audioType: audio?.audioType || 'tts',
        voiceId: audio?.voiceId || null,
        status: audio?.status || 'pending',
        errorMessage: audio?.errorMessage || null,
      };
    }),
  };
}

export async function generateAudiobook(storyId: string, userId: string, options: AudiobookOptions = {}) {
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
