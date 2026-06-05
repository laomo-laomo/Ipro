'use client';

import { useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { cn, isValidFileSize, isValidImage } from '@/lib/utils';
import { Camera, Sparkles, Upload, X } from 'lucide-react';
import { Button } from './button';

export interface PhotoUploaderProps {
  onFileSelect: (file: File) => void;
  previewUrl?: string | null;
  onClear?: () => void;
  isUploading?: boolean;
  uploadProgress?: number | null;
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
  className?: string;
}

export function PhotoUploader({
  onFileSelect,
  previewUrl,
  onClear,
  isUploading = false,
  uploadProgress = null,
  maxSizeMB = 10,
  disabled = false,
  className,
}: PhotoUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];

        if (!isValidImage(file)) {
          alert('请上传 JPG、PNG 或 WebP 格式的图片');
          return;
        }

        if (!isValidFileSize(file, maxSizeMB)) {
          alert(`图片大小不能超过 ${maxSizeMB}MB`);
          return;
        }

        onFileSelect(file);
      }
    },
    [onFileSelect, maxSizeMB]
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      const error = rejections[0].errors[0];
      alert(error.message);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
    },
    maxFiles: 1,
    maxSize: maxSizeMB * 1024 * 1024,
    disabled: disabled || isUploading,
  });

  if (previewUrl) {
    return (
      <div className={cn('rounded-[30px] border border-white/70 bg-white/80 p-5 shadow-paper backdrop-blur-xl', className)}>
        <div className="grid gap-5 sm:grid-cols-[220px_1fr] sm:items-center">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[220px] overflow-hidden rounded-[26px] border border-white/70 bg-gradient-to-br from-violet-100 to-amber-50 p-2 shadow-sm">
            <div className="relative h-full overflow-hidden rounded-[20px] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="预览" className="h-full w-full object-cover" />
              {isUploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1E1B2E]/72 px-5 text-white">
                  <Sparkles className="h-8 w-8 animate-pulse text-amber-300" />
                  <p className="mt-3 text-sm font-medium">照片正在进入故事书...</p>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-300 transition-all duration-300" style={{ width: `${uploadProgress || 0}%` }} />
                  </div>
                  <span className="mt-2 text-xs text-white/80">上传中 {uploadProgress || 0}%</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-violet-700">照片已就位</p>
              <h3 className="mt-1 text-2xl font-bold">主角准备走进童话世界</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">确认照片没问题后继续下一步，我们会自动识别角色特征并进入风格化阶段。</p>
            </div>
            {onClear && !isUploading && (
              <Button type="button" variant="outline" size="sm" onClick={onClear} className="rounded-full px-4">
                <X className="h-4 w-4" />
                更换照片
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'relative overflow-hidden rounded-[32px] border-2 border-dashed p-8 transition-all duration-200',
        isDragActive
          ? 'border-violet-500 bg-gradient-to-br from-violet-50 to-amber-50 shadow-magic'
          : 'border-violet-200 bg-white/72 hover:border-violet-400 hover:bg-white/82 hover:shadow-paper',
        (disabled || isUploading) && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <input {...getInputProps()} />

      <div className="mx-auto flex min-h-[340px] max-w-xl flex-col items-center justify-center text-center">
        <div className={cn('mb-6 flex h-24 w-24 items-center justify-center rounded-[30px] transition-all', isDragActive ? 'bg-violet-100 text-violet-700' : 'bg-gradient-to-br from-violet-100 to-amber-50 text-violet-600')}>
          {isDragActive ? <Camera className="h-10 w-10" /> : <Upload className="h-10 w-10" />}
        </div>
        <h3 className="text-2xl font-bold">{isDragActive ? '松开就能把照片放进故事里' : '拖拽或点击上传照片'}</h3>
        <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">上传宝宝的照片，TA 将成为童话故事的主角。建议使用正面、清晰、光线自然的单人照。</p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2 text-xs font-medium text-violet-700">
          <Sparkles className="h-4 w-4" />
          支持 JPG / PNG / WebP，最大 {maxSizeMB}MB
        </div>

        {isUploading && (
          <div className="mt-6 w-full max-w-[260px] space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-violet-100">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 transition-all duration-300" style={{ width: `${uploadProgress || 0}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">上传中... {uploadProgress || 0}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
