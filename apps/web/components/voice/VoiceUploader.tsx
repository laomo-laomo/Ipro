'use client';

import { useCallback, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { cn } from '@/lib/utils';
import { Music, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface VoiceUploaderProps {
  onFileSelect: (file: File) => void;
  previewUrl?: string | null;
  onClear?: () => void;
  isUploading?: boolean;
  uploadProgress?: number | null;
  disabled?: boolean;
  className?: string;
}

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/mp4'];
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a'];
const MIN_DURATION_SECONDS = 30;

export function VoiceUploader({ onFileSelect, previewUrl, onClear, isUploading = false, uploadProgress = null, disabled = false, className }: VoiceUploaderProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(previewUrl || null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const validateAudio = useCallback((file: File): string | null => {
    const validTypes = [...ACCEPTED_TYPES, 'audio/mpeg', 'audio/x-m4a'];
    if (!validTypes.some((type) => file.type.includes(type.split('/')[1]))) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(`.${ext}`)) {
        return '请上传 MP3、WAV、OGG 或 M4A 格式的音频';
      }
    }

    if (file.size > 10 * 1024 * 1024) {
      return '音频文件大小不能超过 10MB';
    }

    return null;
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setValidationError(null);

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        const error = validateAudio(file);
        if (error) {
          setValidationError(error);
          return;
        }

        const url = URL.createObjectURL(file);
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        setAudioUrl(url);

        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => {
          setAudioDuration(audio.duration);

          if (audio.duration < MIN_DURATION_SECONDS) {
            setValidationError(`音频时长至少需要 ${MIN_DURATION_SECONDS} 秒，当前 ${Math.round(audio.duration)} 秒`);
            URL.revokeObjectURL(url);
            setAudioUrl(null);
            return;
          }

          onFileSelect(file);
        });

        audioRef.current = audio;
      }
    },
    [onFileSelect, validateAudio, audioUrl]
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      const error = rejections[0].errors[0];
      setValidationError(error.message);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'audio/*': ACCEPTED_EXTENSIONS,
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: disabled || isUploading,
  });

  const handleClear = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioDuration(null);
    setValidationError(null);
    if (onClear) {
      onClear();
    }
  }, [audioUrl, onClear]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (audioUrl) {
    return (
      <div className={cn('rounded-[24px] border border-white/70 bg-white/82 p-4 shadow-paper md:rounded-[28px] md:p-5', className)}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
            <Music className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">音频已就位</p>
            {audioDuration && <p className="text-xs text-muted-foreground mt-0.5">时长：{formatDuration(audioDuration)}</p>}
          </div>
          {!isUploading && onClear && (
            <Button variant="ghost" size="icon" onClick={handleClear} className="rounded-full text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {isUploading && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-violet-100">
              <div className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 transition-all duration-300" style={{ width: `${uploadProgress || 0}%` }} />
            </div>
            <span className="mt-2 block text-center text-xs text-muted-foreground">上传中... {uploadProgress || 0}%</span>
          </div>
        )}

        {validationError && <div className="mt-3 rounded-[18px] bg-destructive/10 p-3 text-xs text-destructive">{validationError}</div>}
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-[24px] border-2 border-dashed p-5 transition-all duration-200 md:rounded-[30px] md:p-8',
        isDragActive ? 'border-violet-500 bg-gradient-to-br from-violet-50 to-amber-50 shadow-magic' : 'border-violet-200 bg-white/80 hover:border-violet-400 hover:shadow-paper',
        (disabled || isUploading) && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <input {...getInputProps()} />

      <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center md:min-h-[260px]">
        <div className={cn('flex h-16 w-16 items-center justify-center rounded-[22px] md:h-20 md:w-20 md:rounded-[26px]', isDragActive ? 'bg-violet-100 text-violet-700' : 'bg-gradient-to-br from-violet-100 to-amber-50 text-violet-600')}>
          {isDragActive ? <Music className="h-8 w-8 md:h-9 md:w-9" /> : <Upload className="h-8 w-8 md:h-9 md:w-9" />}
        </div>

        <div className="space-y-2">
          <p className="text-lg font-bold md:text-xl">{isDragActive ? '松开以上传音频样本' : '拖拽或点击上传音频'}</p>
          <p className="max-w-md text-sm leading-7 text-muted-foreground">建议上传 30 秒以上、环境安静、发音清晰的录音，后续克隆效果会更稳定自然。</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-medium text-violet-700">
          <Sparkles className="h-4 w-4" />
          支持 MP3 / WAV / OGG / M4A，最大 10MB
        </div>

        {isUploading && (
          <div className="w-full max-w-[220px] space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-violet-100">
              <div className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 transition-all duration-300" style={{ width: `${uploadProgress || 0}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">上传中... {uploadProgress || 0}%</span>
          </div>
        )}

        {validationError && <div className="rounded-[18px] bg-destructive/10 p-3 text-xs text-destructive">{validationError}</div>}
      </div>
    </div>
  );
}
