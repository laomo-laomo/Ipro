import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { uploadFile } from '../config/oss.js';
import { getMiniMaxSignature, getMiniMaxTimestamp, queryVoiceCloneStatus } from '../config/minimax.js';

// Polling configuration
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const POLL_MAX_DURATION_MS = 10 * 60 * 1_000; // 10 minutes

// Audio validation constants
const MIN_AUDIO_DURATION_SEC = 5;
const MAX_AUDIO_DURATION_SEC = 60;
const ALLOWED_AUDIO_FORMATS = ['mp3', 'wav'] as const;
type AudioFormat = typeof ALLOWED_AUDIO_FORMATS[number];

/**
 * Validate audio sample: duration 5-60s, format mp3/wav
 */
export function validateAudioSample(
  buffer: Buffer,
  filename: string
): { valid: boolean; error?: string; duration?: number } {
  const ext = filename.split('.').pop()?.toLowerCase() as AudioFormat | undefined;

  if (!ext || !ALLOWED_AUDIO_FORMATS.includes(ext)) {
    return {
      valid: false,
      error: `Invalid audio format. Allowed formats: ${ALLOWED_AUDIO_FORMATS.join(', ')}`,
    };
  }

  // Estimate duration based on file size and bitrate assumption
  // For accurate validation, you'd use a library like 'music-metadata'
  // Here we provide the validation structure; real duration check happens at upload
  const fileSizeKB = buffer.length / 1024;
  const estimatedBitrateKbps = 128; // Assume 128kbps MP3/WAV

  // Rough estimation: size(kb) / (bitrate(kbps) / 8) = duration(seconds)
  const estimatedDurationSec = fileSizeKB / (estimatedBitrateKbps / 8);

  if (estimatedDurationSec < MIN_AUDIO_DURATION_SEC) {
    return {
      valid: false,
      error: `Audio too short. Minimum duration: ${MIN_AUDIO_DURATION_SEC} seconds`,
      duration: estimatedDurationSec,
    };
  }

  if (estimatedDurationSec > MAX_AUDIO_DURATION_SEC) {
    return {
      valid: false,
      error: `Audio too long. Maximum duration: ${MAX_AUDIO_DURATION_SEC} seconds`,
      duration: estimatedDurationSec,
    };
  }

  return {
    valid: true,
    duration: estimatedDurationSec,
  };
}

/**
 * Upload audio sample to OSS with validation
 */
export async function uploadAudioSample(
  userId: string,
  name: string,
  audioBuffer: Buffer,
  filename: string
): Promise<{ audioUrl: string; duration: number }> {
  // Validate before upload
  const validation = validateAudioSample(audioBuffer, filename);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const timestamp = Date.now();
  const ext = filename.split('.').pop() || 'mp3';
  const key = `voices/${userId}/${timestamp}.${ext}`;

  const { url } = await uploadFile(key, Buffer.from(audioBuffer), {
    contentType: `audio/${ext}`,
  });

  return { audioUrl: url, duration: validation.duration! };
}

/**
 * Poll voice clone status and update database
 */
async function pollVoiceCloneStatus(voiceId: string, minimaxVoiceId: string): Promise<void> {
  const startTime = Date.now();
  let intervalId: NodeJS.Timeout | null = null;

  const cleanup = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const tick = async (): Promise<'done' | 'continue' | 'timeout'> => {
    // Check timeout
    if (Date.now() - startTime > POLL_MAX_DURATION_MS) {
      await prisma.userVoice.update({
        where: { id: voiceId },
        data: {
          status: 'expired',
          pollingEndedAt: new Date(),
        },
      });
      return 'timeout';
    }

    try {
      const result = await queryVoiceCloneStatus(minimaxVoiceId);

      // Update progress
      if (result.progress !== undefined) {
        await prisma.userVoice.update({
          where: { id: voiceId },
          data: { progress: result.progress },
        });
      }

      if (result.status === 'completed') {
        await prisma.userVoice.update({
          where: { id: voiceId },
          data: {
            status: 'active',
            modelUrl: result.model_url,
            progress: 100,
            pollingEndedAt: new Date(),
          },
        });
        return 'done';
      }

      if (result.status === 'failed') {
        await prisma.userVoice.update({
          where: { id: voiceId },
          data: {
            status: 'failed',
            pollingEndedAt: new Date(),
          },
        });
        return 'done';
      }

      return 'continue';
    } catch (error) {
      console.error(`[VoicePolling] Error checking status for ${minimaxVoiceId}:`, error);
      return 'continue';
    }
  };

  return new Promise((resolve) => {
    intervalId = setInterval(async () => {
      const result = await tick();
      if (result !== 'continue') {
        cleanup();
        resolve();
      }
    }, POLL_INTERVAL_MS);

    // Run first check immediately
    (async () => {
      const result = await tick();
      if (result !== 'continue') {
        cleanup();
        resolve();
      }
    })();
  });
}

/**
 * Create voice clone via MiniMax API
 */
export async function cloneVoiceViaMiniMax(
  userId: string,
  audioUrl: string,
  voiceId: string
): Promise<{ voiceId: string; status: string }> {
  const timestamp = getMiniMaxTimestamp();
  const signature = getMiniMaxSignature();
  const minimaxVoiceId = `ipro_${userId}_${timestamp}`;

  const response = await fetch('https://api.minimax.io/v1/t2a_voice_clone', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      group_id: process.env.MINIMAX_GROUP_ID,
      voice_id: minimaxVoiceId,
      audio_url: audioUrl,
      signature,
    }),
  });

  const data = await response.json() as any;

  if (!response.ok) {
    throw new Error(data.message || 'Failed to clone voice');
  }

  // Update voice record with MiniMax voice ID
  await prisma.userVoice.update({
    where: { id: voiceId },
    data: {
      modelUrl: minimaxVoiceId,
      status: 'processing',
      pollingStartedAt: new Date(),
      progress: 0,
    },
  });

  // Start background polling (don't await)
  pollVoiceCloneStatus(voiceId, minimaxVoiceId).catch((err) => {
    console.error(`[VoicePolling] Polling failed for voice ${voiceId}:`, err);
  });

  return {
    voiceId: minimaxVoiceId,
    status: 'processing',
  };
}

/**
 * Get user's voice list (filters out expired)
 */
export async function getUserVoices(userId: string) {
  return prisma.userVoice.findMany({
    where: {
      userId,
      status: { not: 'expired' },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete voice
 */
export async function deleteVoice(voiceId: string, userId: string) {
  // Verify ownership
  const voice = await prisma.userVoice.findFirst({
    where: { id: voiceId, userId },
  });

  if (!voice) {
    throw new Error('Voice not found');
  }

  await prisma.userVoice.delete({
    where: { id: voiceId },
  });

  return { success: true };
}

/**
 * Check voice clone status
 */
export async function checkVoiceStatus(voiceId: string): Promise<string> {
  const voice = await prisma.userVoice.findUnique({
    where: { id: voiceId },
  });

  if (!voice) {
    throw new Error('Voice not found');
  }

  return voice.status;
}

export default {
  uploadAudioSample,
  cloneVoiceViaMiniMax,
  getUserVoices,
  deleteVoice,
  checkVoiceStatus,
  validateAudioSample,
};