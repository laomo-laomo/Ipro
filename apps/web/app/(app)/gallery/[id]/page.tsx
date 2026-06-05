'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Clock, Download, Loader2, Pause, Play, Share2, Sparkles, Wand2 } from 'lucide-react';
import { useGallery } from '@/hooks/useGallery';
import { IllustrationViewer, VideoPlayer } from '@/components/illustration';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import { FadeIn } from '@/components/motion';
import { formatDate, formatDistanceToNow } from '@/lib/utils/date';
import { IllustrationProgress } from '@/components/story/illustration-progress';
import { VideoProgress, type VideoProgressData } from '@/components/story/video-progress';
import { generateAudiobook, getAudiobook, startVideo } from '@/lib/api/story';
import { API_BASE } from '@/lib/api/client';
import type { Audiobook } from '@/types/story';

export default function GalleryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const storyId = params.id as string;

  const {
    story,
    isLoadingStory,
    storyError,
    loadStory,
    refreshVideo,
    refreshIllustrations,
    retryFailedIllustrations,
    retrySingleIllustration,
  } = useGallery();

  const [showViewer, setShowViewer] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDirection, setPageDirection] = useState(1);
  const [isPollingIllustrations, setIsPollingIllustrations] = useState(false);
  const [isPollingVideo, setIsPollingVideo] = useState(false);
  const [audiobook, setAudiobook] = useState<Audiobook | null>(null);
  const [isLoadingAudiobook, setIsLoadingAudiobook] = useState(false);
  const [audiobookError, setAudiobookError] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [autoPlayPages, setAutoPlayPages] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isStartingVideo, setIsStartingVideo] = useState(false);
  const [videoStartError, setVideoStartError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasReaderInteractedRef = useRef(false);

  useEffect(() => {
    if (!storyId) return;

    loadStory(storyId);
  }, [storyId, loadStory]);

  const loadAudiobook = useCallback(async () => {
    if (!storyId) return;

    try {
      setAudiobookError(null);
      const nextAudiobook = await getAudiobook(storyId);
      setAudiobook(nextAudiobook);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载有声绘本失败';
      setAudiobookError(message);
    }
  }, [storyId]);

  useEffect(() => {
    loadAudiobook();
  }, [loadAudiobook]);

  useEffect(() => {
    if (story?.videoStatus !== 'processing') {
      setIsPollingVideo(false);
      return;
    }

    setIsPollingVideo(true);
    const videoPoll = setInterval(async () => {
      await refreshVideo();
    }, 3000);

    return () => clearInterval(videoPoll);
  }, [refreshVideo, story?.videoStatus]);

  useEffect(() => {
    const hasGenerating = story?.segments.some(
      (s) => s.imageStatus === 'generating' || s.imageStatus === 'pending'
    );

    if (hasGenerating) {
      setIsPollingIllustrations(true);
      const illustrationPoll = setInterval(async () => {
        await refreshIllustrations();
      }, 3000);

      return () => clearInterval(illustrationPoll);
    } else {
      setIsPollingIllustrations(false);
    }
  }, [refreshIllustrations, story?.segments]);

  useEffect(() => {
    setCurrentPage(0);
  }, [story?.id]);

  const segments = story?.segments ?? [];
  const hasReadableContent = segments.length > 0;
  const safeCurrentPage = hasReadableContent ? Math.min(currentPage, segments.length - 1) : 0;
  const currentSegment = hasReadableContent ? segments[safeCurrentPage] : undefined;
  const currentAudioPage = audiobook?.pages.find((page) => page.sceneIndex === safeCurrentPage) || audiobook?.pages[safeCurrentPage];
  const currentAudioUrl = currentAudioPage?.audioUrl || undefined;
  const hasCompletedAudio = audiobook?.pages.some((page) => page.status === 'completed' && page.audioUrl) ?? false;
  const audioReadyCount = audiobook?.pages.filter((page) => page.status === 'completed' && page.audioUrl).length ?? 0;
  const segmentsWithImages = segments.filter((segment) => Boolean(segment.imageUrl));
  const totalPages = Math.max(segments.length, 1);
  const isStoryReadyToRead = story?.status === 'completed' || story?.status === 'illustrating' || story?.status === 'rendering';

  // Check for pending illustration work
  const hasPendingIllustrations = segments.some(
    (s) => s.imageStatus === 'generating' || s.imageStatus === 'pending' || s.imageStatus === 'failed'
  );

  // Build video progress data
  const videoProgressData: VideoProgressData = {
    status: (story?.videoStatus as VideoProgressData['status']) || 'pending',
    progress: story?.videoStatus === 'completed' ? 100 : story?.videoStatus === 'processing' ? 50 : 0,
    videoUrl: story?.videoUrl,
  };

  const handleImageClick = useCallback((index: number) => {
    setViewerInitialIndex(index);
    setShowViewer(true);
  }, []);

  const handleBack = useCallback(() => {
    router.push('/gallery');
  }, [router]);

  const handleDownloadPDF = useCallback(async () => {
    if (!storyId || isDownloadingPdf) return;

    setIsDownloadingPdf(true);
    try {
      const response = await fetch(`${API_BASE}/api/stories/${storyId}/pdf`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        let message = `下载失败: ${response.status}`;
        try {
          const errorBody = await response.json();
          message = errorBody?.message || message;
        } catch {
          // Keep status-based message.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = (story?.title || '我的绘本').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || '我的绘本';
      link.href = objectUrl;
      link.download = `${safeTitle}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : '下载 PDF 失败';
      alert(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [isDownloadingPdf, story?.title, storyId]);

  const handleShare = useCallback(async () => {
    if (!story) return;

    const shareUrl = window.location.origin + '/gallery/' + storyId;
    if (navigator.share) {
      try {
        await navigator.share({
          title: story.title,
          text: '来看看我创作的童话故事：' + story.title,
          url: shareUrl,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      alert('链接已复制到剪贴板');
    }
  }, [story, storyId]);

  const formatAudioTime = useCallback((seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
    const mins = Math.floor(safeSeconds / 60);
    const secs = Math.floor(safeSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const playCurrentAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentAudioUrl) return;

    try {
      await audio.play();
      setIsAudioPlaying(true);
    } catch {
      setIsAudioPlaying(false);
    }
  }, [currentAudioUrl]);

  const pauseCurrentAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsAudioPlaying(false);
  }, []);

  const toggleCurrentAudio = useCallback(async () => {
    hasReaderInteractedRef.current = true;
    if (isAudioPlaying) {
      pauseCurrentAudio();
      return;
    }

    await playCurrentAudio();
  }, [isAudioPlaying, pauseCurrentAudio, playCurrentAudio]);

  const handleGenerateAudiobook = useCallback(async () => {
    if (!storyId) return;

    try {
      setIsLoadingAudiobook(true);
      setAudiobookError(null);
      const nextAudiobook = await generateAudiobook(storyId, { audioType: 'minimax' });
      setAudiobook(nextAudiobook);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成有声绘本失败';
      setAudiobookError(message);
    } finally {
      setIsLoadingAudiobook(false);
    }
  }, [storyId]);

  const handleStartVideo = useCallback(async () => {
    if (!storyId) return;
    // Smart-default: if the Audiobook has cached minimax audio, request minimax
    // so the backend reuses the existing SceneAudio tracks (no extra TTS).
    const cachedVoice = audiobook?.pages?.[0]?.audioType as string | undefined;
    const requestBody: { audioType: 'tts' | 'mimo' | 'minimax' | 'cloned' } =
      cachedVoice && cachedVoice !== 'tts' && cachedVoice !== 'cloned'
        ? { audioType: cachedVoice as 'mimo' | 'minimax' }
        : { audioType: 'tts' };
    try {
      setIsStartingVideo(true);
      setVideoStartError(null);
      // Flip polling on immediately so the JSX branch routes to the
      // progress view (rather than the "no video yet" placeholder inside
      // VideoProgress) while the request is in flight.
      setIsPollingVideo(true);
      await startVideo(storyId, requestBody);
      // Kick a fresh fetch so the videoStatus becomes 'completed' (inline
      // path) or 'processing' (Bull path) and the existing useEffect
      // (line 75) takes over polling.
      await refreshVideo();
    } catch (err) {
      const message = err instanceof Error ? err.message : '启动视频生成失败';
      setVideoStartError(message);
      setIsPollingVideo(false);
    } finally {
      setIsStartingVideo(false);
    }
  }, [storyId, audiobook, refreshVideo]);

  const goToPage = useCallback((nextPage: number) => {
    if (!hasReadableContent) return;

    const boundedPage = Math.max(0, Math.min(segments.length - 1, nextPage));
    if (boundedPage !== safeCurrentPage) {
      hasReaderInteractedRef.current = true;
    }
    setPageDirection(boundedPage > safeCurrentPage ? 1 : -1);
    setCurrentPage(boundedPage);
  }, [hasReadableContent, safeCurrentPage, segments.length]);

  useEffect(() => {
    const audio = new Audio(currentAudioUrl || '');
    audioRef.current = audio;
    setIsAudioPlaying(false);
    setAudioProgress(0);
    setAudioDuration(0);

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration || 0);
    };
    const handleTimeUpdate = () => {
      setAudioProgress(audio.currentTime || 0);
    };
    const handleEnded = () => {
      setIsAudioPlaying(false);
      setAudioProgress(0);

      if (autoPlayPages && safeCurrentPage < totalPages - 1) {
        goToPage(safeCurrentPage + 1);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    if (currentAudioUrl && hasReaderInteractedRef.current) {
      void audio.play().then(() => setIsAudioPlaying(true)).catch(() => setIsAudioPlaying(false));
    }

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.src = '';
    };
  }, [autoPlayPages, currentAudioUrl, goToPage, safeCurrentPage, totalPages]);

  if (isLoadingStory) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (storyError || !story) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h2 className="mb-2 text-xl font-semibold">加载失败</h2>
          <p className="mb-4 text-muted-foreground">{storyError || '故事不存在'}</p>
          <Button onClick={handleBack} className="rounded-full">
            <ArrowLeft className="h-4 w-4" />
            返回作品列表
          </Button>
        </div>
      </div>
    );
  }

  if (!hasReadableContent || !isStoryReadyToRead) {
    return (
      <div className="page-shell page-enter space-y-6">
        <FadeIn>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm font-medium text-violet-700">绘本准备中</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{story.title}</h1>
            </div>
          </div>
        </FadeIn>

        {hasReadableContent && segments.length > 0 && (
          <FadeIn delay={0.05}>
            <GlassCard className="p-6">
              <IllustrationProgress
                segments={segments}
                isPolling={isPollingIllustrations}
                onRetryScene={retrySingleIllustration}
                onRetryAllFailed={retryFailedIllustrations}
              />
            </GlassCard>
          </FadeIn>
        )}

        <FadeIn delay={0.08}>
          <GlassCard className="p-8 text-center sm:p-10">
            <Sparkles className="mx-auto h-12 w-12 text-violet-600" />
            <h2 className="mt-4 text-2xl font-bold">这本绘本还没有准备好翻阅</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              当前状态是&ldquo;{story.status}&rdquo;，可能还在生成分镜、插画或整理内容。等它准备好之后，这里会自动显示完整翻页视图。
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                <Clock className="h-3.5 w-3.5" />
                {formatDistanceToNow(story.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                已生成插画 {segmentsWithImages.length} 张
              </span>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" onClick={handleBack} className="rounded-full">
                返回作品列表
              </Button>
              <Button onClick={() => loadStory(storyId)} className="rounded-full" variant="magic">
                刷新状态
              </Button>
            </div>
          </GlassCard>
        </FadeIn>
      </div>
    );
  }

  return (
    <div className="page-shell page-enter space-y-6">
      <FadeIn>
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm font-medium text-violet-700">翻阅绘本</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{story.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDistanceToNow(story.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                  共 {segments.length} 页
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                  有声 {audioReadyCount}/{segments.length} 页
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleShare} className="rounded-full">
              <Share2 className="h-4 w-4" />
              分享
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={isDownloadingPdf} className="rounded-full">
              {isDownloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isDownloadingPdf ? '下载中...' : '下载 PDF'}
            </Button>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl">
          <div className="grid gap-0 lg:grid-cols-[1fr_1fr]">
            {/* 左侧插画区域 */}
            <div className="relative min-h-[500px] overflow-hidden bg-gradient-to-br from-[#1a1035] via-[#2d1b4e] to-[#1a1035]">
              <button
                type="button"
                onClick={() => currentSegment?.imageUrl && handleImageClick(safeCurrentPage)}
                className="relative h-full w-full text-left"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentSegment?.id || safeCurrentPage}
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="absolute inset-0"
                  >
                    {currentSegment?.imageUrl ? (
                      <img
                        src={currentSegment.imageUrl}
                        alt={currentSegment.title || story.title}
                        className="h-full w-full object-cover"
                        loading="eager"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-violet-600 via-fuchsia-500 to-amber-400">
                        <Sparkles className="h-16 w-16 text-white/80" />
                        <p className="mt-4 text-white/60">插画生成中...</p>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                  </motion.div>
                </AnimatePresence>

              </button>

              {/* 底部场景指示器 */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 backdrop-blur-sm">
                  {segments.map((segment, index) => (
                    <button
                      key={segment.id}
                      onClick={() => goToPage(index)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        index === safeCurrentPage 
                          ? 'w-6 bg-white' 
                          : 'w-2 bg-white/50 hover:bg-white/80'
                      }`}
                      aria-label={`跳转到第 ${index + 1} 页`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 右侧 - 只放音频控件。故事正文已由生成图片承载，不再重复叠加。 */}
            <div className="relative flex min-h-[500px] flex-col justify-between gap-6 bg-gradient-to-b from-[#f8f9ff] via-white to-[#fff8f5] px-8 py-8 lg:px-12 lg:py-12">
              <div className="flex flex-col justify-center gap-4">
                {/* 小场景标题 - 仅做上下文标识，不展示完整正文（正文在图上） */}
                <div className="text-center">
                  <p className="text-xs font-semibold tracking-[0.18em] text-rose-400 uppercase">
                    第 {safeCurrentPage + 1} 页
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-rose-500 lg:text-3xl">
                    {currentSegment?.title || story.title}
                  </h2>
                </div>

                <div className="rounded-2xl border border-rose-100 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    {currentAudioUrl ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={toggleCurrentAudio}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600"
                            aria-label={isAudioPlaying ? '暂停当前页音频' : '播放当前页音频'}
                          >
                            {isAudioPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{formatAudioTime(audioProgress)}</span>
                              <span>{formatAudioTime(audioDuration)}</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-rose-100">
                              <div
                                className="h-full rounded-full bg-rose-500 transition-all duration-100"
                                style={{ width: `${audioDuration ? Math.min(100, (audioProgress / audioDuration) * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <label className="flex items-center justify-between gap-3 text-sm text-gray-600">
                          <span>播完自动翻页</span>
                          <input
                            type="checkbox"
                            checked={autoPlayPages}
                            onChange={(event) => setAutoPlayPages(event.target.checked)}
                            className="h-4 w-4 accent-rose-500"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700">
                            {isLoadingAudiobook ? '正在生成每页旁白...' : hasCompletedAudio ? '这一页还没有旁白音频' : '生成有声绘本后可逐页播放旁白'}
                          </p>
                          {(audiobookError || currentAudioPage?.errorMessage) && (
                            <p className="mt-1 text-xs text-destructive">{audiobookError || currentAudioPage?.errorMessage}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleGenerateAudiobook}
                          disabled={isLoadingAudiobook}
                          className="shrink-0 rounded-full"
                        >
                          {isLoadingAudiobook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                          {hasCompletedAudio ? '补齐旁白' : '生成有声绘本'}
                        </Button>
                      </div>
                    )}
                </div>
              </div>

              {/* 翻页按钮 - 底部 */}
              <div className="mt-auto flex gap-4 pt-2">
                <button
                  onClick={() => goToPage(safeCurrentPage - 1)}
                  disabled={safeCurrentPage === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white/80 py-4 text-sm font-medium text-gray-500 backdrop-blur-sm transition-all hover:border-rose-300 hover:bg-white hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="上一页"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>上一页</span>
                </button>
                <button
                  onClick={() => goToPage(safeCurrentPage + 1)}
                  disabled={safeCurrentPage >= totalPages - 1}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-400 via-fuchsia-500 to-rose-500 py-4 text-sm font-semibold text-white shadow-lg shadow-rose-500/30 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="下一页"
                >
                  <span>下一页</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </FadeIn>

      {hasPendingIllustrations && (
        <FadeIn delay={0.05}>
          <GlassCard className="p-6">
            <IllustrationProgress
              segments={segments}
              isPolling={isPollingIllustrations}
              onRetryScene={retrySingleIllustration}
              onRetryAllFailed={retryFailedIllustrations}
            />
          </GlassCard>
        </FadeIn>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <FadeIn delay={0.08}>
          <GlassCard className="p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper">
            <h3 className="text-xl font-bold">故事信息</h3>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>创建时间：{formatDate(story.createdAt)}</p>
              {story.templateName && <p>使用模板：{story.templateName}</p>}
              <p>已生成插画：{segmentsWithImages.length} 张</p>
            </div>
          </GlassCard>
        </FadeIn>

        <FadeIn delay={0.12}>
          <GlassCard className="p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper">
            <h3 className="mb-4 text-xl font-bold">视频故事</h3>
            {story.videoUrl ? (
              <VideoPlayer src={story.videoUrl} title={story.title} />
            ) : story.videoStatus === 'processing' || (story.videoStatus === 'pending' && isPollingVideo) ? (
              <>
                <VideoProgress
                  data={videoProgressData}
                  isPolling={isPollingVideo}
                  onRetry={async () => { /* TODO: implement video retry */ }}
                />
              </>
            ) : story.videoStatus === 'failed' ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">视频生成失败，请重试</p>
                <Button
                  onClick={handleStartVideo}
                  disabled={isStartingVideo || segmentsWithImages.length === 0}
                >
                  {isStartingVideo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  重新生成视频
                </Button>
                {videoStartError && <p className="text-xs text-destructive">{videoStartError}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  把这本绘本和旁白烧成一段 MP4 视频，支持 App 与微信小程序原生播放。
                </p>
                <Button
                  onClick={handleStartVideo}
                  disabled={isStartingVideo || segmentsWithImages.length === 0}
                >
                  {isStartingVideo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {audiobook?.pages?.length ? '用现有旁白生成视频' : '生成视频故事'}
                </Button>
                {segmentsWithImages.length === 0 && (
                  <p className="text-xs text-muted-foreground">需要先生成插画才能制作视频</p>
                )}
                {videoStartError && <p className="text-xs text-destructive">{videoStartError}</p>}
              </div>
            )}
          </GlassCard>
        </FadeIn>
      </div>

      {showViewer && segmentsWithImages.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black">
          <button onClick={() => setShowViewer(false)} className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20">
            ×
          </button>
          <IllustrationViewer segments={segmentsWithImages} initialIndex={viewerInitialIndex} onClose={() => setShowViewer(false)} />
        </div>
      )}
    </div>
  );
}
