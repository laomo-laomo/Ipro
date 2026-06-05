/**
 * Edge TTS (Text-to-Speech) Service
 *
 * Uses Microsoft Edge's TTS engine via edge-tts library
 * Provides free, offline TTS with multiple Chinese voices
 */

import { spawn } from 'child_process';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getOSSClient } from '../config/oss.js';

export interface EdgeTTSOptions {
  text: string;
  voice?: string;       // Default: zh-CN-XiaoxiaoNeural
  rate?: string;         // Speed: -50% to +100%, e.g. "+0%", "-20%", "+50%"
  volume?: string;      // Volume: -50% to +50%, e.g. "+0%", "-20%"
  pitch?: string;       // Pitch: -50Hz to +50Hz, e.g. "+0Hz", "-10Hz"
  outputPath?: string;  // Local output path (optional, will use temp if not provided)
}

/**
 * Available Edge TTS voices for Chinese
 */
export const EDGE_TTS_VOICES = [
  // Female voices
  { voice: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: 'Female', language: 'zh-CN' },
  { voice: 'zh-CN-XiaoyiNeural', name: '小艺', gender: 'Female', language: 'zh-CN' },
  { voice: 'zh-CN-YunyangNeural', name: '云扬', gender: 'Female', language: 'zh-CN' },
  { voice: 'zh-CN-XiaomoNeural', name: '小莫', gender: 'Female', language: 'zh-CN' },
  { voice: 'zh-CN-XiaoqiuNeural', name: '晓秋', gender: 'Female', language: 'zh-CN' },
  { voice: 'zh-CN-XiaoshuangNeural', name: '晓双', gender: 'Female', language: 'zh-CN' },
  { voice: 'zh-CN-KangkangNeural', name: '康康', gender: 'Female', language: 'zh-CN' },
  { voice: 'zh-CN-XiaochenNeural', name: '晓晨', gender: 'Female', language: 'zh-CN' },
  // Male voices
  { voice: 'zh-CN-YunxiNeural', name: '云希', gender: 'Male', language: 'zh-CN' },
  { voice: 'zh-CN-YunyeNeural', name: '云野', gender: 'Male', language: 'zh-CN' },
  { voice: 'zh-CN-YunfengNeural', name: '云枫', gender: 'Male', language: 'zh-CN' },
  { voice: 'zh-CN-YunhaoNeural', name: '云皓', gender: 'Male', language: 'zh-CN' },
  { voice: 'zh-CN-YunxiaNeural', name: '云夏', gender: 'Male', language: 'zh-CN' },
  { voice: 'zh-CN-YunlongNeural', name: '云龙', gender: 'Male', language: 'zh-CN' },
  // Cantonese voices
  { voice: 'zh-HK-HiuGaaiNeural', name: '曉蕙', gender: 'Female', language: 'zh-HK' },
  { voice: 'zh-HK-HiuMaanNeural', name: '曉敏', gender: 'Female', language: 'zh-HK' },
  { voice: 'zh-HK-WanLungNeural', name: '雲龍', gender: 'Male', language: 'zh-HK' },
  // Taiwanese voices
  { voice: 'zh-TW-HsiaoChenNeural', name: '曉珍', gender: 'Female', language: 'zh-TW' },
  { voice: 'zh-TW-HsiaoYuNeural', name: '曉雨', gender: 'Female', language: 'zh-TW' },
  { voice: 'zh-TW-YunJheNeural', name: '雲哲', gender: 'Male', language: 'zh-TW' },
];

export const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

/**
 * Get voice list with filtering
 */
export function getVoices(language?: string, gender?: string) {
  let voices = EDGE_TTS_VOICES;
  if (language) {
    voices = voices.filter(v => v.language.toLowerCase().startsWith(language.toLowerCase()));
  }
  if (gender) {
    voices = voices.filter(v => v.gender.toLowerCase() === gender.toLowerCase());
  }
  return voices;
}

/**
 * Generate TTS using Edge TTS.
 *
 * Strategy: call Python `edge-tts` bindings directly via `py -3 -c "<script>"`.
 * This works on every machine that has Python 3 with `edge-tts` installed
 * (`pip install edge-tts`), which is already a dev dependency in the project.
 *
 * Why not npx / npm edge-tts?
 * - `npx --yes edge-tts` triggers a fresh npm install in a temp directory and
 *   sometimes fails with "could not determine executable" inside the dev server.
 * - The Python package is already there and version-locked.
 */
export async function generateEdgeTTS(options: EdgeTTSOptions): Promise<{
  audioUrl: string;
  duration?: number;
  charCount: number;
}> {
  const {
    text,
    voice = DEFAULT_VOICE,
    rate = '+0%',
    volume = '+0%',
    pitch = '+0Hz',
    outputPath,
  } = options;

  const tempDir = join(process.cwd(), 'public', 'temp', 'tts');
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const filename = `edge_tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
  const localPath = outputPath || join(tempDir, filename);
  const relativePath = outputPath ? outputPath.replace(/\\/g, '/') : `/temp/tts/${filename}`;

  const pythonScript = `
import asyncio
import edge_tts

async def main():
    communicate = edge_tts.Communicate(
        ${JSON.stringify(text)},
        ${JSON.stringify(voice)},
        rate=${JSON.stringify(rate)},
        volume=${JSON.stringify(volume)},
        pitch=${JSON.stringify(pitch)},
    )
    await communicate.save(${JSON.stringify(localPath)})

asyncio.run(main())
`;

  return new Promise((resolve, reject) => {
    // Try multiple Python invocations in order. The first one that works is used.
    const candidates: Array<{ cmd: string; prefixArgs?: string[] }> = [];
    if (process.platform === 'win32') {
      candidates.push({ cmd: 'py', prefixArgs: ['-3'] });
    } else {
      candidates.push({ cmd: 'python3' });
    }
    candidates.push({ cmd: 'python' });

    // Write the Python script to a temp file and invoke it via the file path
    // rather than passing it inline as `-c "..."` — that path was getting mangled
    // by Windows shell quoting and the spawned Python was receiving None for its
    // `-c` option, producing "expected str, bytes or os.PathLike object, not NoneType".
    const scriptPath = join(tempDir, `edge_tts_script_${Date.now()}_${Math.random().toString(36).substring(7)}.py`);
    writeFile(scriptPath, pythonScript, 'utf8')
      .then(() => {
        let lastError: Error | null = null;
        let i = 0;
        let resolved = false;

        const tryNext = () => {
          if (resolved) return;
          if (i >= candidates.length) {
            unlink(scriptPath).catch(() => undefined);
            return reject(lastError || new Error('No working Python found for edge-tts'));
          }
          const { cmd, prefixArgs = [] } = candidates[i++];
          console.log(`[TTS] Trying Python: ${cmd} ${prefixArgs.join(' ')}`.trim());
          const args = [...prefixArgs, scriptPath];
          const proc = spawn(cmd, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            cwd: process.cwd(),
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
          });

          let stderr = '';
          proc.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          proc.on('error', (err) => {
            if (resolved) return;
            lastError = new Error(`Python ${cmd} spawn error: ${err.message}`);
            console.warn(`[TTS] ${cmd} spawn error, trying next: ${err.message}`);
            tryNext();
          });

          proc.on('close', async (code) => {
            if (resolved) return;
            if (code === 0 && existsSync(localPath)) {
              resolved = true;
              unlink(scriptPath).catch(() => undefined);
              await uploadAndResolve();
            } else {
              lastError = new Error(`Python ${cmd} exited with code ${code}: ${stderr || 'Unknown error'}`);
              console.warn(`[TTS] ${cmd} bad exit, trying next`);
              tryNext();
            }
          });
        };

        const uploadAndResolve = async () => {
          try {
            const oss = getOSSClient();
            if (!oss) throw new Error('OSS not configured');
            const ossKey = `tts/${Date.now()}_${filename}`;
            const audioBuffer = await readFile(localPath);
            await oss.put(ossKey, audioBuffer, { headers: { 'Content-Type': 'audio/mpeg' } });
            const audioUrl = `https://${process.env.OSS_BUCKET || 'ipro'}.oss-${process.env.OSS_REGION || 'cn-shanghai'}.aliyuncs.com/${ossKey}`;
            resolve({ audioUrl, charCount: text.length });
          } catch (uploadError) {
            console.warn(`[TTS] OSS upload failed, serving from local: ${uploadError instanceof Error ? uploadError.message : uploadError}`);
            resolve({ audioUrl: `http://localhost:3001${relativePath}`, charCount: text.length });
          }
        };

        tryNext();
      })
      .catch((err) => reject(new Error(`Failed to write Python script: ${err instanceof Error ? err.message : err}`)));
  });
}

/**
 * Backwards-compatible alias for `generateEdgeTTS`. Kept so older call sites
 * (audiobook/video) still work after consolidating the TTS pipeline.
 */
export async function generateEdgeTTSDirect(
  text: string,
  voice: string = DEFAULT_VOICE,
  outputPath?: string
): Promise<{ audioUrl: string; charCount: number }> {
  const result = await generateEdgeTTS({ text, voice, outputPath });
  return { audioUrl: result.audioUrl, charCount: result.charCount };
}

/**
 * Estimate audio duration from character count
 * Approximate: 1 Chinese character ≈ 0.3-0.5 seconds
 */
export function estimateDuration(charCount: number, rate: string = '+0%'): number {
  // Parse rate adjustment
  const rateMatch = rate.match(/([+-]?\d+)%/);
  const rateAdjust = rateMatch ? parseInt(rateMatch[1]) : 0;
  const speedMultiplier = 1 + rateAdjust / 100;

  // Base: ~0.4 seconds per Chinese character
  const baseDuration = charCount * 0.4;
  return baseDuration / speedMultiplier;
}

// ============================================================
// MiMo-V2.5-TTS provider (Xiaomi MiMo OpenAI-compatible TTS)
// Free, supports preset voices + voice cloning + voice design
// Docs: https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5
// ============================================================

export const MIMO_TTS_VOICES = [
  { voice: 'mimo_default', name: 'MiMo-默认', gender: 'Female', language: 'zh-CN' },
  { voice: '冰糖', name: '冰糖', gender: 'Female', language: 'zh-CN' },
  { voice: '茉莉', name: '茉莉', gender: 'Female', language: 'zh-CN' },
  { voice: '苏打', name: '苏打', gender: 'Male', language: 'zh-CN' },
  { voice: '白桦', name: '白桦', gender: 'Male', language: 'zh-CN' },
  { voice: 'Mia', name: 'Mia', gender: 'Female', language: 'en-US' },
  { voice: 'Chloe', name: 'Chloe', gender: 'Female', language: 'en-US' },
  { voice: 'Milo', name: 'Milo', gender: 'Male', language: 'en-US' },
  { voice: 'Dean', name: 'Dean', gender: 'Male', language: 'en-US' },
];

export const MIMO_DEFAULT_VOICE = '冰糖';
const MIMO_API_URL = process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions';
const MIMO_MODEL = 'mimo-v2.5-tts';

function getMimoApiKey(): string {
  return process.env.MIMO_API_KEY || '';
}

function getMimoAuthHeader(): Record<string, string> {
  const key = getMimoApiKey();
  if (!key) return {};
  // Newer token-plan keys use `Authorization: Bearer ...`; older MiMo keys use `api-key: ...`.
  return key.startsWith('tp-') ? { Authorization: `Bearer ${key}` } : { 'api-key': key };
}

export interface MimoTTSOptions {
  text: string;
  voice?: string;            // Voice ID (e.g. "冰糖"); defaults to MIMO_DEFAULT_VOICE
  styleInstruction?: string; // Natural-language style hint (placed in user message)
  outputPath?: string;
}

/**
 * Generate TTS using Xiaomi MiMo V2.5 (OpenAI-compatible chat completions API).
 * Audio is returned as base64 in message.audio.data; we decode to wav and save.
 */
export async function generateMimoTTS(options: MimoTTSOptions): Promise<{
  audioUrl: string;
  duration?: number;
  charCount: number;
}> {
  const {
    text,
    voice = MIMO_DEFAULT_VOICE,
    styleInstruction = 'Warm, gentle, child-friendly tone, calm pace — like narrating a bedtime story to a young child.',
    outputPath,
  } = options;

  const apiKey = getMimoApiKey();
  if (!apiKey) {
    throw new Error('MIMO_API_KEY not configured in env');
  }

  const tempDir = join(process.cwd(), 'public', 'temp', 'tts');
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const filename = `mimo_tts_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`;
  const localPath = outputPath || join(tempDir, filename);
  const relativePath = outputPath ? outputPath.replace(/\\/g, '/') : `/temp/tts/${filename}`;

  const body = {
    model: MIMO_MODEL,
    messages: [
      { role: 'user', content: styleInstruction },
      { role: 'assistant', content: text },
    ],
    audio: { format: 'wav', voice },
  };

  const response = await fetch(MIMO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getMimoAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`MiMo TTS HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const result = (await response.json()) as any;
  const audioBase64: string | undefined = result?.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    throw new Error(`MiMo TTS response missing audio data: ${JSON.stringify(result).slice(0, 500)}`);
  }

  const audioBytes = Buffer.from(audioBase64, 'base64');
  await writeFile(localPath, audioBytes);

  // Upload to OSS; fall back to local URL.
  try {
    const oss = getOSSClient();
    if (!oss) throw new Error('OSS not configured');
    const ossKey = `tts/${Date.now()}_${filename}`;
    await oss.put(ossKey, audioBytes, { headers: { 'Content-Type': 'audio/wav' } });
    const audioUrl = `https://${process.env.OSS_BUCKET || 'ipro'}.oss-${process.env.OSS_REGION || 'cn-shanghai'}.aliyuncs.com/${ossKey}`;
    return { audioUrl, charCount: text.length };
  } catch (uploadError) {
    console.warn(`[TTS] OSS upload failed, serving from local: ${uploadError instanceof Error ? uploadError.message : uploadError}`);
    return { audioUrl: `http://localhost:3001${relativePath}`, charCount: text.length };
  }
}

// ============================================================
// MiniMax T2A v2 (CodePlanPlus key) — sync HTTP TTS
// Docs: https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
// Uses Bearer auth, returns hex-encoded mp3/wav/pcm in `data.audio`.
// ============================================================

export const MINIMAX_TTS_VOICES = [
  // Chinese
  { voice: 'male-qn-qingse', name: '青涩青年', gender: 'Male', language: 'zh-CN' },
  { voice: 'female-shaonv', name: '少女音', gender: 'Female', language: 'zh-CN' },
  { voice: 'male-qn-jingying', name: '精英男声', gender: 'Male', language: 'zh-CN' },
  { voice: 'female-yujie', name: '御姐音', gender: 'Female', language: 'zh-CN' },
  { voice: 'Chinese (Mandarin)_Lyrical_Voice', name: '抒情嗓音', gender: 'Female', language: 'zh-CN' },
  // English
  { voice: 'English_Graceful_Lady', name: 'Graceful Lady', gender: 'Female', language: 'en-US' },
  { voice: 'English_Insightful_Speaker', name: 'Insightful Speaker', gender: 'Male', language: 'en-US' },
];

export const MINIMAX_DEFAULT_VOICE = 'male-qn-qingse';
const MINIMAX_API_URL = process.env.MINIMAX_TTS_URL || 'https://api.minimaxi.com/v1/t2a_v2';
const MINIMAX_DEFAULT_MODEL = 'speech-2.6-hd';

function getMinimaxApiKey(): string {
  return process.env.MINIMAX_API_KEY || '';
}

export interface MinimaxTTSOptions {
  text: string;
  voice?: string;
  model?: string;
  speed?: number;
  vol?: number;
  pitch?: number;
  emotion?: 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'calm' | 'fluent' | 'whisper';
  outputPath?: string;
}

export async function generateMinimaxTTS(options: MinimaxTTSOptions): Promise<{
  audioUrl: string;
  duration?: number;
  charCount: number;
}> {
  const {
    text,
    voice = MINIMAX_DEFAULT_VOICE,
    model = MINIMAX_DEFAULT_MODEL,
    speed = 1,
    vol = 1,
    pitch = 0,
    outputPath,
  } = options;

  const apiKey = getMinimaxApiKey();
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY not configured in env');
  }

  const tempDir = join(process.cwd(), 'public', 'temp', 'tts');
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }

  const filename = `minimax_tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
  const localPath = outputPath || join(tempDir, filename);
  const relativePath = outputPath ? outputPath.replace(/\\/g, '/') : `/temp/tts/${filename}`;

  const body = {
    model,
    text,
    stream: false,
    voice_setting: { voice_id: voice, speed, vol, pitch },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
  };

  const response = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`MiniMax TTS HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const result = (await response.json()) as any;
  if (result?.base_resp?.status_code && result.base_resp.status_code !== 0) {
    throw new Error(`MiniMax TTS error: ${result.base_resp.status_msg || 'unknown'} (code ${result.base_resp.status_code})`);
  }
  const audioHex: string | undefined = result?.data?.audio;
  if (!audioHex) {
    throw new Error(`MiniMax TTS response missing audio hex: ${JSON.stringify(result).slice(0, 500)}`);
  }

  const audioBytes = Buffer.from(audioHex, 'hex');
  await writeFile(localPath, audioBytes);

  // Upload to OSS; fall back to local URL.
  try {
    const oss = getOSSClient();
    if (!oss) throw new Error('OSS not configured');
    const ossKey = `tts/${Date.now()}_${filename}`;
    await oss.put(ossKey, audioBytes, { headers: { 'Content-Type': 'audio/mpeg' } });
    const audioUrl = `https://${process.env.OSS_BUCKET || 'ipro'}.oss-${process.env.OSS_REGION || 'cn-shanghai'}.aliyuncs.com/${ossKey}`;
    const durationMs = result?.extra_info?.audio_length;
    return { audioUrl, duration: durationMs ? Math.round(durationMs / 1000) : undefined, charCount: text.length };
  } catch (uploadError) {
    console.warn(`[TTS] OSS upload failed, serving from local: ${uploadError instanceof Error ? uploadError.message : uploadError}`);
    const durationMs = result?.extra_info?.audio_length;
    return { audioUrl: `http://localhost:3001${relativePath}`, duration: durationMs ? Math.round(durationMs / 1000) : undefined, charCount: text.length };
  }
}

export default {
  EDGE_TTS_VOICES,
  DEFAULT_VOICE,
  getVoices,
  generateEdgeTTS,
  generateEdgeTTSDirect,
  estimateDuration,
  MIMO_TTS_VOICES,
  MIMO_DEFAULT_VOICE,
  generateMimoTTS,
  MINIMAX_TTS_VOICES,
  MINIMAX_DEFAULT_VOICE,
  generateMinimaxTTS,
};
