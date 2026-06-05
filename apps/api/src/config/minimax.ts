import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';

const API_KEY = process.env.MINIMAX_API_KEY || '';
const GROUP_ID = process.env.MINIMAX_GROUP_ID || '';

export function getMiniMaxSignature(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', API_KEY)
    .update(`${GROUP_ID}${timestamp}`)
    .digest('hex');
  return signature;
}

export function getMiniMaxTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export const minimaxConfig = {
  apiKey: API_KEY,
  groupId: GROUP_ID,
  baseUrl: 'https://api.minimax.io/v1',
};

// MiniMax API response types
export interface MiniMaxVoiceCloneStatus {
  voice_id: string;
  status: 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  model_url?: string;
  error_message?: string;
}

/**
 * Query voice clone status from MiniMax API
 * https://api.minimax.io/v1/t2a/voice_clone/status
 */
export async function queryVoiceCloneStatus(
  minimaxVoiceId: string
): Promise<MiniMaxVoiceCloneStatus> {
  const timestamp = getMiniMaxTimestamp();
  const signature = getMiniMaxSignature();

  const response = await fetch(
    `https://api.minimax.io/v1/t2a/voice_clone/status?voice_id=${encodeURIComponent(minimaxVoiceId)}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Group-Id': GROUP_ID,
        'Signature': signature,
        'Signature-Timestamp': String(timestamp),
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiniMax status query failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<MiniMaxVoiceCloneStatus>;
}

export default { minimaxConfig, getMiniMaxSignature, getMiniMaxTimestamp, queryVoiceCloneStatus };