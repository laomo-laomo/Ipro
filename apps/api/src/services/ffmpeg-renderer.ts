/**
 * FFmpeg-based video renderer.
 *
 * Composes a list of illustrations + 1 audio track into an MP4 using a
 * single ffmpeg invocation. The "renderer" is intentionally pluggable:
 * this file is the `ffmpeg` strategy. A future `remotion` strategy can
 * live alongside it and be selected by `process.env.VIDEO_RENDERER`.
 *
 * Why ffmpeg: a 7-8 scene 绘本 is just N still images + 1 audio track
 * stitched with equal per-scene duration. The React/Composition
 * expressiveness of Remotion is not needed for that.
 *
 * Output spec: H.264 (libx264, yuv420p), AAC audio, 24fps, 4:3 frame.
 */

import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LOCAL_UPLOAD_DIR = resolve(process.cwd(), 'public', 'uploads');
const LOCAL_TEMP_DIR = resolve(process.cwd(), 'public', 'temp');

export interface RenderScene {
  index: number;
  imageUrl: string;
  text?: string;
  title?: string;
}

export interface RenderInput {
  title: string;
  scenes: RenderScene[];
  /**
   * Already-uploaded audio URL (TTS or cloned voice). Will be downloaded
   * via fetch() and probed with ffprobe to get the canonical duration.
   */
  audioUrl: string;
  /** Logical duration estimate (sec); the real duration is probed from the audio. */
  estimatedAudioSec?: number;
  width?: number;
  height?: number;
  fps?: number;
}

export interface RenderResult {
  buffer: Buffer;
  durationSec: number;
  width: number;
  height: number;
  fileSize: number;
  sceneCount: number;
}

const FFMPEG_LOG_TAIL = 1500;

function runProcess(bin: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveProc, rejectProc) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    proc.on('error', rejectProc);
    proc.on('close', (code) => resolveProc({ stdout, stderr, code: code ?? -1 }));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return runProcess('ffmpeg', args).then(({ stdout, stderr, code }) => {
    if (code === 0) return;
    const tail = stderr.slice(-FFMPEG_LOG_TAIL);
    throw new Error(`ffmpeg exited ${code}: ${tail}`);
  });
}

async function runFfprobeJson(filePath: string): Promise<any> {
  const { stdout, code, stderr } = await runProcess('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  if (code !== 0) {
    throw new Error(`ffprobe failed (${code}): ${stderr.slice(-400)}`);
  }
  return JSON.parse(stdout);
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  if (url.startsWith('/uploads/')) {
    // Local public upload (development fallback). Read directly to skip the loopback HTTP hop.
    const localPath = join(LOCAL_UPLOAD_DIR, url.replace(/^\/uploads\//, ''));
    if (!existsSync(localPath)) {
      throw new Error(`Local upload not found: ${localPath}`);
    }
    const buf = require('node:fs').readFileSync(localPath);
    writeFileSync(dest, buf);
    return;
  }
  if (url.startsWith('/temp/')) {
    // Local TTS / illustration temp dir (development). Served via static route
    // but we can also read directly to avoid the loopback HTTP hop and to
    // dodge cases where the API process serving /temp/ is the one we are in.
    const localPath = join(LOCAL_TEMP_DIR, url.replace(/^\/temp\//, ''));
    if (!existsSync(localPath)) {
      throw new Error(`Local temp file not found: ${localPath}`);
    }
    const buf = require('node:fs').readFileSync(localPath);
    writeFileSync(dest, buf);
    return;
  }
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const ab = await res.arrayBuffer();
  writeFileSync(dest, Buffer.from(ab));
}

async function probeAudioDurationSec(audioPath: string): Promise<number> {
  const meta = await runFfprobeJson(audioPath);
  const fmtDur = parseFloat(meta?.format?.duration);
  if (Number.isFinite(fmtDur) && fmtDur > 0) return fmtDur;
  for (const s of meta?.streams ?? []) {
    const d = parseFloat(s?.duration);
    if (Number.isFinite(d) && d > 0) return d;
  }
  throw new Error(`Cannot determine audio duration for ${audioPath}`);
}

function safeRmDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

export function isFfmpegRendererEnabled(): boolean {
  return (process.env.VIDEO_RENDERER ?? 'ffmpeg').toLowerCase() === 'ffmpeg';
}

/**
 * Render the story to an MP4 buffer.
 * Caller is responsible for uploading the buffer (e.g. via uploadFile)
 * and persisting the resulting URL on the Video record.
 */
export async function renderWithFfmpeg(input: RenderInput): Promise<RenderResult> {
  if (!input.scenes || input.scenes.length === 0) {
    throw new Error('renderWithFfmpeg: scenes must be non-empty');
  }
  const width = input.width ?? 1024;
  const height = input.height ?? 768;
  const fps = input.fps ?? 24;
  const sceneCount = input.scenes.length;

  const workDir = mkdtempSync(join(tmpdir(), 'ipro-video-'));
  try {
    // 1) Download audio
    const audioPath = join(workDir, 'audio.bin');
    await downloadToFile(input.audioUrl, audioPath);

    // 2) Probe real duration
    const totalAudioSec = await probeAudioDurationSec(audioPath);
    if (!Number.isFinite(totalAudioSec) || totalAudioSec <= 0) {
      throw new Error('Probed audio duration is non-positive');
    }
    const perSceneSec = totalAudioSec / sceneCount;
    // Guard against ffmpeg choking on absurdly small per-scene durations
    if (perSceneSec < 0.1) {
      throw new Error(
        `Per-scene duration too small (${perSceneSec.toFixed(3)}s). ` +
        `Audio ${totalAudioSec.toFixed(2)}s / ${sceneCount} scenes.`
      );
    }

    // 3) Download illustrations
    const imagePaths: string[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const p = join(workDir, `img-${i}.bin`);
      await downloadToFile(input.scenes[i].imageUrl, p);
      imagePaths.push(p);
    }

    // 4) Build ffmpeg invocation
    const outPath = join(workDir, 'out.mp4');
    const args: string[] = ['-y'];
    // Each image: -loop 1 -t <perSceneSec> -i <path>
    for (let i = 0; i < sceneCount; i++) {
      args.push('-loop', '1', '-t', perSceneSec.toFixed(3), '-i', imagePaths[i]);
    }
    // Audio input (last index = sceneCount)
    args.push('-i', audioPath);

    // Concat the stills into one video stream, then letterbox to 4:3 frame
    const concatIn = imagePaths.map((_, i) => `[${i}:v]`).join('');
    const filter =
      `${concatIn}concat=n=${sceneCount}:v=1:a=0,` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=white,` +
      `setsar=1,format=yuv420p[vout]`;
    args.push('-filter_complex', filter);
    args.push('-map', '[vout]');
    args.push('-map', `${sceneCount}:a`);
    args.push('-r', String(fps));
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
    args.push('-c:a', 'aac', '-b:a', '128k');
    args.push('-movflags', '+faststart');
    args.push('-shortest');
    args.push(outPath);

    await runFfmpeg(args);

    const buffer = readFileSync(outPath);
    return {
      buffer,
      durationSec: totalAudioSec,
      width,
      height,
      fileSize: buffer.length,
      sceneCount,
    };
  } finally {
    safeRmDir(workDir);
  }
}

export default {
  renderWithFfmpeg,
  isFfmpegRendererEnabled,
};
