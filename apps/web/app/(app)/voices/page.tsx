'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Info, Loader2, Mic2, Sparkles } from 'lucide-react';
import { VoiceUploader, VoiceCard } from '@/components/voice';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import { useVoices } from '@/hooks/useVoices';
import { useToast } from '@/components/ui/toast';

export default function VoicesPage() {
  const router = useRouter();
  const { success: showToast } = useToast();
  const {
    voices,
    isLoading,
    isUploading,
    isCloning,
    uploadProgress,
    uploadError,
    cloneError,
    error,
    uploadAudio,
    loadVoices,
    removeVoice,
    clone,
    resetError,
  } = useVoices();

  const [deletingVoiceId, setDeletingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

  const handleFileSelect = useCallback(async (file: File) => {
    const result = await uploadAudio(file);
    if (result) {
      showToast('音频上传成功！');
    }
  }, [uploadAudio, showToast]);

  const handleDelete = useCallback(async (voiceId: string) => {
    setDeletingVoiceId(voiceId);
    await removeVoice(voiceId);
    setDeletingVoiceId(null);
  }, [removeVoice]);

  const handleClone = useCallback(async (voiceId: string) => {
    const voice = voices.find((item) => item.id === voiceId);
    if (voice) {
      showToast('声音克隆已启动！');
      await clone(voiceId, `${voice.name} (克隆)`);
    }
  }, [voices, clone, showToast]);

  return (
    <div className="page-shell page-enter space-y-5 md:space-y-8">
      <FadeIn>
        <section className="flex items-start justify-between gap-3 md:gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/create/upload')} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm font-medium text-violet-700">我的声音魔法屋</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">把熟悉的声音，留在每一页故事里</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-3 md:text-base">上传 30 秒以上的清晰音频，孩子就能在绘本视频和故事朗读里听见最亲切的声音。</p>
            </div>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.05}>
        <GlassCard className="p-5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Mic2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold md:text-2xl">上传音频样本</h2>
              <p className="text-sm text-muted-foreground">支持录音或文件上传，建议环境安静、发音清晰。</p>
            </div>
          </div>
          <VoiceUploader onFileSelect={handleFileSelect} isUploading={isUploading} uploadProgress={uploadProgress?.percentage || null} />

          {uploadError && (
            <div className="mt-4 rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">
              {uploadError}
              <button onClick={resetError} className="ml-2 underline hover:no-underline">
                关闭
              </button>
            </div>
          )}
        </GlassCard>
      </FadeIn>

      <FadeIn delay={0.08}>
        <GlassCard className="p-5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper sm:p-8">
          <div className="flex items-start gap-3">
            <Info className="mt-1 h-5 w-5 text-amber-500" />
            <div>
              <h2 className="text-xl font-bold">费用说明</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">声音克隆：¥19.9 / 次，克隆声音使用：¥0.2 / 千字。上传优质音频会显著提升效果稳定性。</p>
            </div>
          </div>
        </GlassCard>
      </FadeIn>

      <section className="space-y-4">
        <FadeIn delay={0.1}>
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <h2 className="text-2xl font-bold">我的声音列表</h2>
          </div>
        </FadeIn>

        {isLoading && !voices.length ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : voices.length === 0 ? (
          <FadeIn>
            <GlassCard className="px-5 py-12 text-center md:py-16">
              <h3 className="text-xl font-bold">还没有保存任何声音</h3>
              <p className="mt-3 text-sm text-muted-foreground">先上传一段样本，故事就能拥有属于你们家的语气和温度。</p>
            </GlassCard>
          </FadeIn>
        ) : (
          <StaggerList className="grid gap-4">
            {voices.map((voice) => (
              <StaggerItem key={voice.id}>
                <VoiceCard
                  voice={voice}
                  onDelete={handleDelete}
                  onClone={handleClone}
                  isCloning={isCloning}
                  isDeleting={deletingVoiceId === voice.id}
                />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </section>

      {(cloneError || error) && (
        <FadeIn>
          <div className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">
            {cloneError || error}
            <button onClick={resetError} className="ml-2 underline hover:no-underline">
              关闭
            </button>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
