/**
 * MiniMax TTS + Voice Clone Service
 *
 * Integrates with MiniMax API for:
 * - Text-to-Speech (TTS) using cloned voices
 * - Voice cloning management
 */

import crypto from 'crypto';
import { uploadFile } from '../config/oss.js';

const API_KEY = process.env.MINIMAX_API_KEY || '';
const GROUP_ID = process.env.MINIMAX_GROUP_ID || '';
const BASE_URL = 'https://api.minimax.io/v1';

/**
 * Voice types available on MiniMax
 */
export const MINIMAX_VOICES = [
  { voice_id: 'male-qn-qingse', name: 'male-qn-qingse', language: 'zh', description: '清澈男声' },
  { voice_id: 'male-qn-qingse_2', name: 'male-qn-qingse_2', language: 'zh', description: '清澈男声2' },
  { voice_id: 'male-tianmei', name: 'male-tianmei', language: 'zh', description: '甜美男声' },
  { voice_id: 'female-tianmei', name: 'female-tianmei', language: 'zh', description: '甜美女声' },
  { voice_id: 'female-yizhou', name: 'female-yizhou', language: 'zh', description: '知性女声' },
  { voice_id: 'male-sha', name: 'male-sha', language: 'zh', description: '暖男声' },
  { voice_id: 'male-qn-qingse_v2', name: 'male-qn-qingse_v2', language: 'zh', description: '清澈男声v2' },
  { voice_id: 'male-tianmei_v2', name: 'male-tianmei_v2', language: 'zh', description: '甜美男声v2' },
];

/**
 * Get MiniMax API signature
 */
export function getMiniMaxSignature(groupId: string, timestamp: number): string {
  return crypto
    .createHmac('sha256', API_KEY)
    .update(`${groupId}${timestamp}`)
    .digest('hex');
}

/**
 * Get MiniMax timestamp
 */
export function getMiniMaxTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * MiniMax TTS request options
 */
export interface MiniMaxTTSOptions {
  text: string;
  voice_id?: string;
  speed?: number;       // 0.5 - 2.0, default 1.0
  volume?: number;      // 0 - 100, default 50
  pitch?: number;       // -500 - 500, default 0
  emotion?: string;     // neutral, sad, happy, angry
  output_file?: string; // Output file path for saving
}

/**
 * MiniMax TTS response
 */
export interface MiniMaxTTSResponse {
  model?: string;
  request_id?: string;
  audio_file?: string;
  extra_info?: {
    duration?: number;
    characters?: number;
  };
}

/**
 * Generate TTS audio using MiniMax API
 *
 * @param options - TTS options including text, voice_id, etc.
 * @returns Audio file URL or buffer
 */
export async function generateMiniMaxTTS(options: MiniMaxTTSOptions): Promise<{
  audioUrl?: string;
  duration?: number;
  charCount?: number;
}> {
  const {
    text,
    voice_id = 'female-tianmei',
    speed = 1.0,
    volume = 50,
    pitch = 0,
    emotion = 'neutral',
  } = options;

  const timestamp = getMiniMaxTimestamp();
  const signature = getMiniMaxSignature(GROUP_ID, timestamp);

  try {
    const response = await fetch(`${BASE_URL}/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text,
        stream: false,
        voice_setting: {
          voice_id,
          speed,
          volume,
          pitch,
          emotion,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        group_id: GROUP_ID,
        timestamp,
        signature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throw new Error(errorData.message || `MiniMax API error: ${response.status}`);
    }

    // Check if response is JSON (metadata) or binary (audio)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json() as MiniMaxTTSResponse;
      return {
        audioUrl: data.audio_file,
        duration: data.extra_info?.duration,
        charCount: data.extra_info?.characters,
      };
    }

    // Binary audio response - convert to base64 and upload
    const buffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(buffer);

    // Upload to OSS or local storage
    const key = `tts/${Date.now()}.mp3`;
    const { url: audioUrl } = await uploadFile(key, audioBuffer, {
      contentType: 'audio/mpeg',
    });

    return {
      audioUrl,
      charCount: text.length,
    };
  } catch (error) {
    console.error('[MiniMax TTS] Error:', error);
    throw error;
  }
}

/**
 * Generate TTS with a cloned voice
 *
 * @param userId - User ID for voice ownership
 * @param modelUrl - Cloned voice model URL from MiniMax
 * @param text - Text to convert to speech
 * @param voiceName - Voice identifier name
 * @returns Audio file URL
 */
export async function generateClonedVoiceTTS(
  userId: string,
  modelUrl: string,
  text: string,
  voiceName?: string
): Promise<{ audioUrl: string; duration?: number }> {
  // Use the model_url as voice_id
  const voice_id = voiceName || modelUrl;

  const result = await generateMiniMaxTTS({
    text,
    voice_id,
    speed: 1.0,
    volume: 50,
    pitch: 0,
    emotion: 'neutral',
  });

  if (!result.audioUrl) {
    throw new Error('Failed to generate TTS audio');
  }

  return {
    audioUrl: result.audioUrl,
    duration: result.duration,
  };
}

/**
 * Clone voice via MiniMax API
 *
 * @param userId - User ID for voice ownership
 * @param audioUrl - URL of the audio sample
 * @returns Voice ID from MiniMax
 */
export async function cloneVoice(
  userId: string,
  audioUrl: string
): Promise<{ voiceId: string; status: string }> {
  const timestamp = getMiniMaxTimestamp();
  const signature = getMiniMaxSignature(GROUP_ID, timestamp);

  try {
    const response = await fetch(`${BASE_URL}/t2a_voice_clone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        group_id: GROUP_ID,
        voice_id: `ipro_${userId}_${timestamp}`,
        audio_url: audioUrl,
        timestamp,
        signature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throw new Error(errorData.message || `MiniMax voice clone error: ${response.status}`);
    }

    const data = await response.json() as any;

    return {
      voiceId: data.voice_id,
      status: 'processing',
    };
  } catch (error) {
    console.error('[MiniMax Voice Clone] Error:', error);
    throw error;
  }
}

/**
 * Check voice clone status
 *
 * @param voiceId - Voice ID to check
 * @returns Status of the voice clone
 */
export async function checkVoiceCloneStatus(voiceId: string): Promise<{
  status: 'processing' | 'ready' | 'failed';
  modelUrl?: string;
  error?: string;
}> {
  const timestamp = getMiniMaxTimestamp();
  const signature = getMiniMaxSignature(GROUP_ID, timestamp);

  try {
    const response = await fetch(`${BASE_URL}/t2a_voice_clone/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        group_id: GROUP_ID,
        voice_id: voiceId,
        timestamp,
        signature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throw new Error(errorData.message || `MiniMax status check error: ${response.status}`);
    }

    const data = await response.json() as any;

    return {
      status: data.status === 'ready' ? 'ready' : data.status === 'failed' ? 'failed' : 'processing',
      modelUrl: data.model_url,
      error: data.error,
    };
  } catch (error) {
    console.error('[MiniMax Voice Status] Error:', error);
    throw error;
  }
}

/**
 * Calculate TTS cost based on character count
 *
 * @param charCount - Number of characters
 * @param pricePerKChar - Price per 1000 characters (default from config)
 * @returns Cost in currency units
 */
export function calculateTTSCost(charCount: number, pricePerKChar: number = 0.2): number {
  return Math.ceil(charCount / 1000) * pricePerKChar;
}

export default {
  MINIMAX_VOICES,
  generateMiniMaxTTS,
  generateClonedVoiceTTS,
  cloneVoice,
  checkVoiceCloneStatus,
  calculateTTSCost,
  getMiniMaxSignature,
  getMiniMaxTimestamp,
};
