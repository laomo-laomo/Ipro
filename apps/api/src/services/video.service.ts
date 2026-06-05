/**
 * Video Service
 *
 * Handles video generation using Remotion
 * Integrates with TTS services for audio generation
 */

import { prisma } from '../config/database.js';
import { generateEdgeTTS, generateEdgeTTSDirect } from './tts.service.js';
import { generateClonedVoiceTTS } from './minimax.service.js';
import { normalizeStoryboard } from '../types/storyboard.js';
import { deductQuota } from './membership.service.js';
import { renderWithFfmpeg, isFfmpegRendererEnabled } from './ffmpeg-renderer.js';
import { uploadFile } from '../config/oss.js';

const REMOTION_API_URL = process.env.REMOTION_API_URL || 'http://localhost:3456';

// Configuration
const RENDER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10 * 1000; // 10 seconds

export interface Scene {
  index: number;
  description: string;
  text: string;
  title?: string;
  titleEn?: string;
  textEn?: string;
  voiceover?: string;
  voiceoverEn?: string;
  subtitle?: string;
}

export interface VideoGenerationOptions {
  storyId: string;
  userId: string;
  audioType: 'tts' | 'mimo' | 'minimax' | 'cloned';
  voiceId?: string;
  voiceName?: string;
  voice?: string; // Edge TTS voice name
}

export interface VideoMetadata {
  audioUrl?: string;
  duration?: number;
  resolution?: string;
  fileSize?: number;
}

// Remotion health check state (cached)
let remotionHealthy: boolean | null = null;
let lastHealthCheck: number = 0;
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute cache

function toVideoScenes(story: { scenes: string | null; title: string }) {
  const storyboard = normalizeStoryboard(story.scenes, story.title);
  return storyboard.scenes.map((scene) => ({
    index: scene.index,
    title: scene.title,
    titleEn: scene.titleEn,
    description: scene.imageDescription,
    text: scene.storyText,
    textEn: scene.storyTextEn,
    voiceover: scene.voiceover,
    voiceoverEn: scene.voiceoverEn,
    subtitle: scene.subtitle,
  }));
}

function getSceneAudioText(scene: ReturnType<typeof toVideoScenes>[number]): string {
  return (scene.voiceover || scene.text || '').trim();
}

/**
 * Check if Remotion API is available
 * Caches the result for HEALTH_CHECK_INTERVAL_MS
 */
export async function checkRemotionHealth(): Promise<boolean> {
  const now = Date.now();

  // Return cached result if still valid
  if (remotionHealthy !== null && now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return remotionHealthy;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${REMOTION_API_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    remotionHealthy = response.ok;
  } catch {
    remotionHealthy = false;
  }

  lastHealthCheck = now;
  return remotionHealthy;
}

/**
 * Initialize Remotion health check on service load
 * Logs warning if not available but doesn't block startup
 */
export async function initRemotionHealthCheck(): Promise<void> {
  const healthy = await checkRemotionHealth();
  if (!healthy) {
    console.warn(`[Video] Remotion API not available at ${REMOTION_API_URL}. Video rendering will fail until Remotion is started.`);
  } else {
    console.log(`[Video] Remotion API healthy at ${REMOTION_API_URL}`);
  }
}

/**
 * Create video record and prepare for rendering
 */
export async function createVideoRecord(
  storyId: string,
  userId: string,
  options: Partial<VideoGenerationOptions> = {}
): Promise<{ videoId: string; status: string; charCount: number }> {
  // Verify story ownership
  const story = await prisma.story.findFirst({
    where: { id: storyId, userId },
    include: { illustrations: true },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  // Check if story has illustrations
  if (story.illustrations.length === 0) {
    throw new Error('Story has no illustrations. Please generate illustrations first.');
  }

  const scenes = toVideoScenes(story);
  const charCount = scenes.reduce((sum, s) => sum + getSceneAudioText(s).length, 0);

  // Calculate cost
  const audioCost = options.audioType === 'cloned' ? charCount * 0.0002 : 0;
  const videoCost = 0.1; // Base video rendering cost

  // Create video record
  const video = await prisma.video.create({
    data: {
      storyId,
      audioType: options.audioType || 'tts',
      voiceId: options.voiceId,
      charCount,
      cost: audioCost + videoCost,
      status: 'pending',
    },
  });

  // Update story status
  await prisma.story.update({
    where: { id: storyId },
    data: { status: 'completed' },
  });

  return {
    videoId: video.id,
    status: video.status,
    charCount,
  };
}

/**
 * Try to reuse existing per-scene SceneAudio by concatenating the completed
 * tracks in scene order. Returns null if any scene is missing, in which case
 * the caller should fall back to TTS.
 *
 * Why: the Audiobook flow already generated one MP3 per scene at /temp/tts/.
 * Reusing them avoids re-running TTS (especially paid voices like minimax)
 * and preserves the user's voice choice without an extra charge.
 */
export async function tryReuseSceneAudio(
  storyId: string,
  options: {
    audioType: 'tts' | 'mimo' | 'minimax' | 'cloned';
    voiceId?: string;
  }
): Promise<{ audioBuffer: Buffer; durationSec: number; voice: string } | null> {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) return null;

  const storyboard = normalizeStoryboard(story.scenes, story.title);
  const expected = storyboard.scenes.length;
  if (expected === 0) return null;

  const rows = await prisma.sceneAudio.findMany({
    where: { storyId, status: 'completed' },
    orderBy: { sceneIndex: 'asc' },
  });
  if (rows.length < expected) return null;

  // Verify contiguous 0..N-1 and voice match the requested audioType/voiceId
  for (let i = 0; i < expected; i++) {
    if (!rows[i] || rows[i].sceneIndex !== i) return null;
    if (!rows[i].audioUrl) return null;
    if (options.audioType === 'cloned' && rows[i].audioType !== 'cloned') return null;
    if (options.audioType === 'tts' && rows[i].audioType === 'cloned') {
      // cached voice is cloned, requested is tts → voice would mismatch, regenerate
      return null;
    }
    if (options.audioType === 'cloned' && options.voiceId && rows[i].voiceId !== options.voiceId) {
      return null;
    }
  }

  // Concat the per-scene audio with ffmpeg concat demuxer
  const { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { spawn } = await import('node:child_process');

  const workDir = mkdtempSync(join(tmpdir(), 'ipro-audio-'));
  try {
    // Download / copy each scene audio into work dir as 000.mp3, 001.mp3, ...
    for (let i = 0; i < expected; i++) {
      const url = rows[i].audioUrl!;
      const dest = join(workDir, `${String(i).padStart(3, '0')}.mp3`);
      if (url.startsWith('/temp/')) {
        const localPath = join(process.cwd(), 'public', url.replace(/^\//, ''));
        if (!existsSync(localPath)) return null;
        const buf = require('node:fs').readFileSync(localPath);
        writeFileSync(dest, buf);
      } else if (url.startsWith('/uploads/')) {
        const localPath = join(process.cwd(), 'public', url.replace(/^\//, ''));
        if (!existsSync(localPath)) return null;
        const buf = require('node:fs').readFileSync(localPath);
        writeFileSync(dest, buf);
      } else {
        // Remote URL: download via fetch
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        writeFileSync(dest, Buffer.from(ab));
      }
    }

    // Write concat list
    const listPath = join(workDir, 'list.txt');
    const listBody = Array.from({ length: expected }, (_, i) => `file '${String(i).padStart(3, '0')}.mp3'`).join('\n');
    writeFileSync(listPath, listBody + '\n');

    // Run ffmpeg concat (stream copy, no re-encode)
    const outPath = join(workDir, 'out.mp3');
    await new Promise<void>((resolveProc, rejectProc) => {
      const proc = spawn('ffmpeg', [
        '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c', 'copy',
        outPath,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', rejectProc);
      proc.on('close', (code) => {
        if (code === 0) resolveProc();
        else rejectProc(new Error(`ffmpeg concat exited ${code}: ${stderr.slice(-400)}`));
      });
    });

    // Probe duration
    const probe = await new Promise<string>((resolveProc, rejectProc) => {
      const proc = spawn('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1',
        outPath,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let so = '';
      let se = '';
      proc.stdout.on('data', (d) => { so += d.toString(); });
      proc.stderr.on('data', (d) => { se += d.toString(); });
      proc.on('error', rejectProc);
      proc.on('close', (code) => {
        if (code === 0) resolveProc(so.trim());
        else rejectProc(new Error(`ffprobe failed ${code}: ${se}`));
      });
    });
    const durationSec = parseFloat(probe);
    if (!Number.isFinite(durationSec) || durationSec <= 0) return null;

    const audioBuffer = readFileSync(outPath);
    const voice = rows[0].audioType || 'tts';
    return { audioBuffer, durationSec, voice };
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/**
 * Generate TTS audio for a story.
 * First tries to reuse existing SceneAudio (concat) to avoid redundant TTS.
 * Falls back to TTS only if some scenes are missing.
 */
export async function generateStoryAudio(
  storyId: string,
  options: {
    audioType: 'tts' | 'mimo' | 'minimax' | 'cloned';
    voiceId?: string;
    voiceName?: string;
    voice?: string;
  }
): Promise<{ audioUrl: string; duration?: number; reusedFromSceneAudio?: boolean }> {
  // Try reuse first. If all scenes have completed SceneAudio, concat them.
  const reused = await tryReuseSceneAudio(storyId, options);
  if (reused) {
    // Upload the concat to durable storage so the URL survives API restarts.
    const key = `audio/${storyId}/${Date.now()}.mp3`;
    const { url: audioUrl } = await uploadFile(key, reused.audioBuffer, {
      contentType: 'audio/mpeg',
    });
    return { audioUrl, duration: reused.durationSec, reusedFromSceneAudio: true };
  }

  const story = await prisma.story.findUnique({
    where: { id: storyId },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  const scenes = toVideoScenes(story);
  const fullText = scenes.map(getSceneAudioText).filter(Boolean).join('。');

  if (options.audioType === 'cloned' && options.voiceId) {
    const userVoice = await prisma.userVoice.findUnique({
      where: { id: options.voiceId },
    });
    if (!userVoice || userVoice.status !== 'active') {
      throw new Error('Voice not available or not ready');
    }
    const result = await generateClonedVoiceTTS(
      story.userId,
      userVoice.modelUrl || userVoice.id,
      fullText,
      options.voiceName
    );
    return { ...result, reusedFromSceneAudio: false };
  } else {
    try {
      const result = await generateEdgeTTSDirect(
        fullText,
        options.voice || 'zh-CN-XiaoxiaoNeural'
      );
      return { ...result, reusedFromSceneAudio: false };
    } catch {
      const result = await generateEdgeTTS({
        text: fullText,
        voice: options.voice || 'zh-CN-XiaoxiaoNeural',
      });
      return { ...result, reusedFromSceneAudio: false };
    }
  }
}

/**
 * Fetch video metadata from URL
 * Returns duration, resolution, file size
 */
async function fetchVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
  try {
    const response = await fetch(videoUrl, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');

    return {
      // Duration and resolution would ideally come from video analysis
      // For now, we can only get file size from HEAD request
      fileSize: contentLength ? parseInt(contentLength, 10) : undefined,
      // Duration and resolution would need video processing to determine
      // This is a placeholder - real implementation would analyze video
    };
  } catch {
    return {};
  }
}

/**
 * Call Remotion API with auto-retry for 503/504 errors
 */
async function callRemotionAPI(
  endpoint: string,
  body: object,
  retries = MAX_RETRIES
): Promise<any> {
  const url = `${REMOTION_API_URL}${endpoint}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // Success
      if (response.ok) {
        return await response.json();
      }

      // Retry on 503/504
      if (response.status === 503 || response.status === 504) {
        if (attempt < retries) {
          console.log(`[Video] Remotion returned ${response.status}, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
      }

      // Non-retryable error
      const errorText = await response.text();
      throw new Error(`Remotion API error: ${response.status} - ${errorText}`);
    } catch (error) {
      // Retry on network errors too
      if (attempt < retries && error instanceof Error && error.message.includes('fetch')) {
        console.log(`[Video] Network error calling Remotion, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Render video.
 *
 * Strategy is selected by `process.env.VIDEO_RENDERER` (default `ffmpeg`).
 * The legacy `remotion` path is still importable for future re-enable but
 * the default execution now runs ffmpeg in-process — no separate renderer
 * service required. See `ffmpeg-renderer.ts` for the pipeline details.
 */
export async function renderVideo(
  videoId: string,
  storyId: string,
  options?: {
    onProgress?: (stage: string, progress: number) => void;
  }
): Promise<{ videoUrl: string; metadata?: VideoMetadata }> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      illustrations: {
        orderBy: { sceneIndex: 'asc' },
      },
    },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
  });

  if (!video) {
    throw new Error('Video not found');
  }

  // Resolve scenes (with illustrations) and the audio track URL.
  const scenes = toVideoScenes(story);
  const renderScenes = scenes
    .map((scene) => {
      const illustration = story.illustrations.find((i) => i.sceneIndex === scene.index);
      const imageUrl = illustration?.imageUrl?.trim();
      if (!imageUrl) return null;
      return {
        index: scene.index,
        title: scene.title,
        description: scene.description,
        text: getSceneAudioText(scene),
        imageUrl,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (renderScenes.length === 0) {
    throw new Error('No completed illustrations available for this story');
  }

  if (!video.audioUrl) {
    throw new Error('Audio not generated yet. Audio phase must run before render.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);

  try {
    if (isFfmpegRendererEnabled()) {
      const rendered = await renderWithFfmpeg({
        title: story.title,
        scenes: renderScenes,
        audioUrl: video.audioUrl,
      });

      // Upload the MP4 to OSS/COS/local fallback
      const key = `videos/${videoId}.mp4`;
      const { url: videoUrl } = await uploadFile(key, rendered.buffer, {
        contentType: 'video/mp4',
      });

      const metadata: VideoMetadata = {
        duration: rendered.durationSec,
        resolution: `${rendered.width}x${rendered.height}`,
        fileSize: rendered.fileSize,
      };

      await prisma.video.update({
        where: { id: videoId },
        data: {
          videoUrl,
          status: 'completed',
          duration: metadata.duration,
          resolution: metadata.resolution,
          fileSize: metadata.fileSize,
        },
      });

      options?.onProgress?.('completed', 100);

      return { videoUrl, metadata };
    }

    // ----- Legacy Remotion path (kept for future re-enable) -----
    const isHealthy = await checkRemotionHealth();
    if (!isHealthy) {
      throw new Error(`Remotion API not available at ${REMOTION_API_URL}`);
    }
    const storyData = {
      title: story.title,
      scenes: scenes.map((scene, index) => {
        const illustration = story.illustrations.find((i) => i.sceneIndex === scene.index);
        return {
          index: scene.index,
          title: scene.title,
          titleEn: scene.titleEn,
          description: scene.description,
          text: getSceneAudioText(scene),
          textEn: scene.voiceoverEn || scene.textEn || '',
          subtitle: scene.subtitle,
          imageUrl: illustration?.imageUrl || '',
          order: index,
        };
      }),
    };
    const result = await callRemotionAPI('/api/render', {
      action: 'render-full',
      data: storyData,
    });
    const videoUrl = result.videoUrl || result.url;
    const metadata = await fetchVideoMetadata(videoUrl);
    await prisma.video.update({
      where: { id: videoId },
      data: {
        videoUrl,
        status: 'completed',
        duration: metadata.duration,
        resolution: metadata.resolution,
        fileSize: metadata.fileSize,
      },
    });
    options?.onProgress?.('completed', 100);
    return { videoUrl, metadata };
  } catch (error: any) {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'failed' },
    });
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      throw new Error('Video rendering timed out after 10 minutes');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get video status and details
 */
export async function getVideoDetails(storyId: string, userId: string) {
  const story = await prisma.story.findFirst({
    where: { id: storyId, userId },
    include: {
      videos: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  const video = story.videos[0];

  if (!video) {
    return {
      storyId,
      video: null,
    };
  }

  return {
    storyId,
    video: {
      id: video.id,
      videoUrl: video.videoUrl,
      audioUrl: video.audioUrl,
      audioType: video.audioType,
      voiceId: video.voiceId,
      charCount: video.charCount,
      cost: video.cost,
      status: video.status,
      duration: video.duration,
      resolution: video.resolution,
      fileSize: video.fileSize,
      createdAt: video.createdAt,
    },
  };
}

/**
 * Get all videos for a story
 */
export async function getStoryVideos(storyId: string, userId: string) {
  const story = await prisma.story.findFirst({
    where: { id: storyId, userId },
    include: {
      videos: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  return {
    storyId,
    videos: story.videos.map(v => ({
      id: v.id,
      videoUrl: v.videoUrl,
      audioUrl: v.audioUrl,
      audioType: v.audioType,
      voiceId: v.voiceId,
      charCount: v.charCount,
      cost: v.cost,
      status: v.status,
      duration: v.duration,
      resolution: v.resolution,
      fileSize: v.fileSize,
      createdAt: v.createdAt,
    })),
  };
}

/**
 * Mark video as processing
 */
export async function markVideoProcessing(videoId: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { status: 'processing' },
  });
}

/**
 * Mark video as failed
 */
export async function markVideoFailed(videoId: string, error: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { status: 'failed' },
  });

  console.error(`[Video] Failed ${videoId}: ${error}`);
}

/**
 * Mark video as completed with metadata
 */
export async function markVideoCompleted(
  videoId: string,
  videoUrl: string,
  metadata?: VideoMetadata
): Promise<void> {
  const video = await prisma.video.update({
    where: { id: videoId },
    data: {
      status: 'completed',
      videoUrl,
      audioUrl: metadata?.audioUrl,
      duration: metadata?.duration,
      resolution: metadata?.resolution,
      fileSize: metadata?.fileSize,
    },
  });

  // Deduct quota after successful video rendering
  const story = await prisma.story.findUnique({
    where: { id: video.storyId },
    select: { userId: true },
  });
  if (story) {
    await deductQuota(story.userId, 1).catch(err => {
      console.error('[Video] Failed to deduct quota:', err.message);
    });
  }
}

/**
 * Update video audio URL
 */
export async function updateVideoAudioUrl(videoId: string, audioUrl: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { audioUrl },
  });
}

/**
 * Check video render status from Remotion
 */
export async function checkVideoRenderStatus(jobId: string): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  progress?: number;
}> {
  try {
    const response = await fetch(`${REMOTION_API_URL}/api/status/${jobId}`);

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const result = await response.json() as any;

    return {
      status: result.status,
      videoUrl: result.videoUrl,
      progress: result.progress,
    };
  } catch (error) {
    return {
      status: 'failed',
    };
  }
}

export default {
  createVideoRecord,
  generateStoryAudio,
  renderVideo,
  getVideoDetails,
  getStoryVideos,
  markVideoProcessing,
  markVideoFailed,
  markVideoCompleted,
  updateVideoAudioUrl,
  checkVideoRenderStatus,
  checkRemotionHealth,
  initRemotionHealthCheck,
};