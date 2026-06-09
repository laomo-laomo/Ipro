'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Trash2, Camera, ChevronDown } from 'lucide-react';
import { PhotoUploader } from '@/components/ui/photo-uploader';
import { Button } from '@/components/ui/button';
import { CreationStepper } from '@/components/ui/creation-stepper';
import { useCharacter } from '@/hooks/useCharacter';
import { useToast } from '@/components/ui/toast';
import { createPreviewUrl, revokePreviewUrl } from '@/lib/utils';
import { FadeIn } from '@/components/motion';
import { useAuthContext } from '@/providers/AuthProvider';

export default function UploadPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthContext();
  const { success: showToast, error: showError } = useToast();
  const { uploadPhoto, isUploading, uploadProgress, uploadError, error, reset, characters, loadCharacters, removeCharacter } = useCharacter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    loadCharacters();
  }, [isAuthLoading, isAuthenticated, loadCharacters]);

  const handleFileSelect = useCallback((file: File) => {
    if (previewUrl) revokePreviewUrl(previewUrl);
    setPreviewUrl(createPreviewUrl(file));
    setSelectedFile(file);
    setSelectedExistingId(null);
  }, [previewUrl]);

  const handleClear = useCallback(() => {
    if (previewUrl) revokePreviewUrl(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setSelectedExistingId(null);
    reset();
  }, [previewUrl, reset]);

  const handleSelectExisting = useCallback((characterId: string) => {
    setSelectedExistingId(characterId);
    setSelectedFile(null);
    if (previewUrl) revokePreviewUrl(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  const handleDeleteCharacter = useCallback(async (e: React.MouseEvent, characterId: string) => {
    e.stopPropagation();
    try {
      await removeCharacter(characterId);
      if (selectedExistingId === characterId) setSelectedExistingId(null);
      showToast('照片已删除');
    } catch {
      showError('删除失败');
    }
  }, [removeCharacter, selectedExistingId, showToast, showError]);

  const handleUpload = useCallback(async () => {
    if (isUploading) return;
    if (selectedExistingId) {
      router.push(`/create/story?characterId=${selectedExistingId}`);
      return;
    }
    if (!selectedFile) return;
    const result = await uploadPhoto(selectedFile);
    if (result) {
      showToast('照片上传成功！');
      router.push(`/create/story?characterId=${result.characterId}`);
    }
  }, [selectedFile, selectedExistingId, uploadPhoto, showToast, router, isUploading]);

  const firstPhoto = characters[0]?.originalPhotoUrl;
  const hasSelection = selectedFile || selectedExistingId;

  return (
    <div className="page-shell page-enter space-y-5 md:space-y-6">
      <FadeIn>
        <section className="space-y-3 md:space-y-4">
          <CreationStepper current="upload" />
          <div>
            <p className="text-sm font-medium text-violet-700">第一步</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">选择主角的照片</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-3 md:text-base md:leading-8">上传新照片，或从相册选择已有的。</p>
          </div>
        </section>
      </FadeIn>

      {/* Album card */}
      {characters.length > 0 && (
        <FadeIn delay={0.05}>
          <button
            onClick={() => setAlbumOpen(!albumOpen)}
            className="group w-full overflow-hidden rounded-[24px] border border-white/70 bg-white/85 text-left shadow-paper transition-all hover:shadow-lg md:rounded-[28px]"
          >
            <div className="relative h-28 sm:h-32 overflow-hidden">
              {firstPhoto ? (
                <>
                  <img src={firstPhoto} alt="相册封面" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                </>
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-100 to-amber-50">
                  <Camera className="h-12 w-12 text-violet-300" />
                </div>
              )}
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                <div>
                  <p className="font-bold text-white drop-shadow">我的相册</p>
                  <p className="text-sm text-white/80 drop-shadow">{characters.length} 张照片，点击展开选择</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-violet-700 shadow transition-transform duration-300" style={{ transform: albumOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <ChevronDown className="h-4 w-4" />
                </div>
              </div>
            </div>
          </button>
        </FadeIn>
      )}

      {/* Album content (expanded) */}
      {albumOpen && (
        <FadeIn delay={0.02}>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 md:gap-3 lg:grid-cols-6">
            {characters.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectExisting(c.id)}
                className={`group relative aspect-square overflow-hidden rounded-[18px] border-2 transition-all md:rounded-[20px] ${
                  selectedExistingId === c.id
                    ? 'border-violet-500 ring-2 ring-violet-200 shadow-lg'
                    : 'border-transparent hover:border-violet-200 hover:shadow-md'
                }`}
              >
                <img src={c.originalPhotoUrl} alt="已上传照片" className="h-full w-full object-cover" />
                <div
                  onClick={(e) => handleDeleteCharacter(e, c.id)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </div>
                {selectedExistingId === c.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-violet-600/20">
                    <span className="text-xs font-bold text-white bg-violet-600 px-2 py-1 rounded-full">已选中</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </FadeIn>
      )}

      {/* Upload area */}
      <FadeIn delay={0.08}>
        <PhotoUploader onFileSelect={handleFileSelect} previewUrl={previewUrl} onClear={handleClear} isUploading={isUploading} uploadProgress={uploadProgress?.percentage || null} />
      </FadeIn>

      {/* Errors */}
      {(uploadError || error) && <div className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">{uploadError || error}</div>}

      <FadeIn delay={0.12}>
        <div className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-paper backdrop-blur-xl md:rounded-[28px] md:p-5">
          {isUploading && uploadProgress ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">上传中...</span>
                <span className="font-medium text-violet-700">{uploadProgress.percentage}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-violet-100">
                <div className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 transition-all duration-300" style={{ width: `${uploadProgress.percentage}%` }} />
              </div>
            </div>
          ) : (
            <Button onClick={handleUpload} disabled={!hasSelection || isUploading} className="w-full rounded-full" size="lg" variant="magic">
              {selectedExistingId ? (
                <><ArrowRight className="h-4 w-4" /> 使用这张照片继续</>
              ) : selectedFile ? (
                <><ArrowRight className="h-4 w-4" /> 确认上传并继续</>
              ) : (
                <><ArrowRight className="h-4 w-4" /> 请先选择一张照片</>
              )}
            </Button>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
