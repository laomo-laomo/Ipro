'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, FileText, Loader2, Play, RefreshCw, Sparkles } from 'lucide-react';
import { CreationStepper } from '@/components/ui/creation-stepper';
import { GenerationProgress } from '@/components/story/generation-progress';
import { StoryPreview } from '@/components/story/story-preview';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import { CelebrationOverlay, FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import { useStory } from '@/hooks/useStory';
import { useCharacter } from '@/hooks/useCharacter';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { StorySegment } from '@/types/story';

function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const storyId = searchParams?.get('storyId') ?? null;

  const {
    story,
    progress,
    isPolling,
    isLoading,
    isLoading: isLoadingStory,
    error,
    loadStory,
    startProgressPolling,
    stopProgressPolling,
    startIllustration,
    refreshIllustrations,
    editSegments,
    reset,
  } = useStory();

  const { character, isLoading: isLoadingCharacter, loadCharacter } = useCharacter();
  const { error: showError } = useToast();

  const [isIllustrating, setIsIllustrating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  // Set of scene indices currently being retried (single-scene retry, not the batch).
  // Multiple scenes can be retrying in parallel — the user can fire off a few at once.
  const [retryingSceneIndices, setRetryingSceneIndices] = useState<Set<number>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const autoIllustrationStartedRef = useRef<string | null>(null);
  const completedCelebrationRef = useRef<string | null>(null);
  const navigationRef = useRef(false);
  // 标记用户是否主动点击了生成绘本按钮，防止 useEffect 自动触发覆盖用户操作
  const userTriggeredRef = useRef(false);
  // 同步守卫：防止 React state 异步更新期间的重复点击
  const illustrationLockRef = useRef(false);
  const allIllustrationsCompleted = Boolean(
    story?.segments.length && story.segments.every((segment) => !!segment.imageUrl),
  );

  useEffect(() => {
    if (!storyId) return;

    loadStory(storyId);
    startProgressPolling(storyId);

    return () => {
      stopProgressPolling();
      reset();
    };
  }, [storyId, loadStory, startProgressPolling, stopProgressPolling, reset]);

  useEffect(() => {
    if (story?.characterId && !character) {
      loadCharacter(story.characterId);
    }
  }, [story?.characterId, character, loadCharacter]);

  const handleStartIllustration = useCallback(async (force: boolean = false) => {
    if (!character) {
      console.log('[handleStartIllustration] no character, returning');
      return;
    }
    // 同步守卫：ref 层立即拦截，不等 React 状态更新
    // 同时检查 isIllustrating 状态确保双重保险
    if (illustrationLockRef.current || isIllustrating) {
      showError('正在生成绘本中，请稍候...');
      return;
    }
    illustrationLockRef.current = true;
    setIsIllustrating(true);
    setIsRegenerating(force);
    // 标记用户主动操作，阻止 useEffect 自动触发
    userTriggeredRef.current = true;
    try {
      await startIllustration(character, { force });
      // API 返回后立即刷新插画状态
      await refreshIllustrations();
      // 启动轮询 - isIllustrating 将在轮询完成/失败时重置
      if (storyId) {
        startProgressPolling(storyId);
      }
    } catch (err) {
      console.error('启动插画失败:', err);
      const message = err instanceof Error ? err.message : '未知错误';
      // "Story already has illustrations" means we hit the wrong endpoint — the
      // existing 6 illustrations are the answer. Force a fresh load so the
      // gallery re-renders with `imageStatus: 'completed'`. Without this, the
      // page stays stuck on whatever stale `segments` were in state, often
      // showing all 6 cards as "生成失败 / 重试" even though the rows are fine.
      if (message.includes('Story already has illustrations')) {
        if (storyId) {
          await loadStory(storyId);
          await refreshIllustrations();
        }
      } else {
        showError(`生成失败: ${message}`);
      }
      // API 失败时也要解锁，否则永远卡住
      setIsIllustrating(false);
      setIsRegenerating(false);
      illustrationLockRef.current = false;
    }
    // 注意：成功时不在这里释放 isIllustrating 和 lockRef
    // 它们将在轮询检测到 completed/failed 时由下方 useEffect 重置
  }, [character, isIllustrating, showError, refreshIllustrations, startIllustration, startProgressPolling, storyId, loadStory]);

  // 监听轮询进度，当完成或失败时重置生成状态
  useEffect(() => {
    if (!progress) return;
    if (progress.status === 'completed' || progress.status === 'failed') {
      // 生成结束，重置锁
      setIsIllustrating(false);
      setIsRegenerating(false);
      illustrationLockRef.current = false;
      // 刷新插画状态确保UI最新
      refreshIllustrations();
    }
  }, [progress, refreshIllustrations]);

  useEffect(() => {
    if (
      !storyId ||
      !story ||
      !character ||
      isIllustrating ||
      story.status !== 'completed' ||
      story.segments.length === 0 ||
      // Don't auto-trigger if any scene is still working OR if any scene has hard-failed
      // (a hard failure needs the user to read the error and decide whether to retry).
      // After the previous fix in normalizeStory, segments with a real imageUrl
      // are always 'completed', so this check now also covers "all scenes have
      // their image already — don't kick off a second illustration job".
      story.segments.some((segment) =>
        segment.imageUrl ||
        segment.imageStatus === 'generating' ||
        segment.imageStatus === 'failed'
      ) ||
      autoIllustrationStartedRef.current === story.id ||
      userTriggeredRef.current
    ) {
      return;
    }

    autoIllustrationStartedRef.current = story.id;
    handleStartIllustration(false);
  }, [character, handleStartIllustration, isIllustrating, story, storyId]);

  useEffect(() => {
    if (!story?.id) {
      return;
    }

    if (!allIllustrationsCompleted) {
      if (completedCelebrationRef.current === story.id) {
        completedCelebrationRef.current = null;
      }
      return;
    }

    if (story.id !== completedCelebrationRef.current) {
      completedCelebrationRef.current = story.id;
      setShowCelebration(true);
    }
  }, [allIllustrationsCompleted, story?.id]);

  const handleSegmentsChange = useCallback(async (segments: StorySegment[]) => {
    await editSegments(segments);
  }, [editSegments]);

  if (!storyId) {
    return (
      <div className="page-shell text-center">
        <p className="mb-4 text-muted-foreground">还没有故事任务，请先在上一步选择模板或输入故事主题。</p>
<Button onClick={() => router.push('/create/story')} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              去选择故事
            </Button>
      </div>
    );
  }

  if (isLoadingStory || isLoadingCharacter) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!story) {
    return (
      <div className="page-shell text-center">
        <p className="mb-4 text-muted-foreground">未找到故事信息</p>
<Button onClick={() => router.push('/create/story')} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              返回故事选择
            </Button>
      </div>
    );
  }

  const storyState = {
    isFailed: story.status === 'failed',
    isStoryCompleted: story.status === 'completed' || story.segments.length > 0,
    hasSegments: story.segments.length > 0,
    hasIllustrations: story.segments.some((segment) => !!segment.imageUrl),
    allIllustrationsCompleted,
  };
  const displayError = error?.includes('Story already has illustrations')
    ? '当前故事已经有插画了。如需重做，请点击“重新生成插画”。'
    : error;
  const storyFailureReason = progress?.errorMessage || progress?.message || story.errorMessage || displayError;

  return (
    <>
      <CelebrationOverlay open={showCelebration} onClose={() => setShowCelebration(false)} />
      <div className="page-shell page-enter space-y-5 md:space-y-6">
        <FadeIn>
          <section className="space-y-3 md:space-y-4">
            <CreationStepper current="generate" characterId={story.characterId || undefined} storyId={storyId} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:gap-4">
              <div>
                <p className="text-sm font-medium text-emerald-600">第四步</p>
                <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">AI 正在把故事写成一本真的绘本</h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-3 md:text-base md:leading-8">先写剧情，再生成绘本插画，最后你可以预览每一页并继续生成更多内容。</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => router.push(`/create/story?characterId=${story.characterId}`)} className="rounded-full">
                <ArrowLeft className="h-4 w-4" />
                返回
              </Button>
            </div>
          </section>
        </FadeIn>

        {!storyState.isStoryCompleted && !storyState.isFailed && <FadeIn delay={0.08}><GenerationProgress progress={progress} isPolling={isPolling} onRetry={() => handleStartIllustration(false)} /></FadeIn>}

        {storyState.isFailed && (
          <FadeIn delay={0.08}>
            <GlassCard className="p-5 text-center md:p-8">
              <FileText className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-4 text-lg font-semibold">这次 AI 创作失败了</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">故事内容没有成功生成出来。你可以返回上一步重新选择故事，或者直接回到故事选择页再试一次。</p>
              {storyFailureReason && (
                <p className="mx-auto mt-3 max-w-2xl rounded-md bg-destructive/10 px-4 py-3 text-left text-sm leading-6 text-destructive">
                  失败原因：{storyFailureReason}
                </p>
              )}
              <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
                <Button variant="outline" onClick={() => loadStory(storyId)} className="rounded-full">
                  <RefreshCw className="h-4 w-4" />
                  刷新状态
                </Button>
<Button onClick={() => {
              if (navigationRef.current) return;
              navigationRef.current = true;
              router.push('/create/story?characterId=' + story.characterId);
            }} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
              </div>
            </GlassCard>
          </FadeIn>
        )}

        {storyState.isStoryCompleted && storyState.hasSegments && (
          <StaggerList className="space-y-5 md:space-y-6">
            {!showPreview ? (
              <>
                <StaggerItem>
                  <GlassCard className="p-5 sm:p-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-emerald-600">故事已完成</p>
                        <h2 className="mt-1 text-xl font-bold leading-tight md:text-2xl">{story.title}</h2>
                        <p className="mt-2 text-sm leading-7 text-muted-foreground">现在可以先阅读剧情，也可以直接继续生成绘本插画，把每一幕都变成完整书页。</p>
                      </div>
                      <div className="grid gap-2 sm:flex sm:flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => setShowPreview(true)} className="rounded-full">
                          <FileText className="h-4 w-4" />
                          阅读故事
                        </Button>
{character && (
                          <Button onClick={() => {
                            if (isIllustrating || illustrationLockRef.current) {
                              showError('正在生成绘本中，请稍候...');
                              return;
                            }
                            handleStartIllustration(storyState.hasIllustrations);
                          }} disabled={isIllustrating || isLoading || illustrationLockRef.current} className="rounded-full" variant="magic" title={isIllustrating ? '正在生成中，请稍候...' : undefined}>
                            {isIllustrating ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {isRegenerating ? '重新生成绘本...' : '生成绘本中...'}
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                {storyState.hasIllustrations ? '重新生成绘本' : '生成绘本'}
                              </>
                            )}
                          </Button>
                        )}
                        {storyState.allIllustrationsCompleted && (
<Button onClick={() => {
              if (navigationRef.current) return;
              navigationRef.current = true;
              router.push('/gallery');
            }} className="rounded-full">
              <ArrowRight className="h-4 w-4" />
              前往我的作品
            </Button>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                </StaggerItem>

                <StaggerList className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
                  {story.segments.map((segment) => {
                    const isGenerating = isIllustrating && !segment.imageUrl;
                    // A scene whose DB status is still 'generating' but the page isn't
                    // currently running a batch illustration is STUCK — the job died
                    // mid-flight (Redis hiccup, server restart, etc.) and never wrote
                    // a terminal status. Show it as recoverable rather than letting
                    // the spinner lie about progress.
                    const isStuck = !isIllustrating && segment.imageStatus === 'generating' && !segment.imageUrl;
                    const isFailed = segment.imageStatus === 'failed' || isStuck;
                    return (
                      <StaggerItem key={segment.id}>
                        <GlassCard className={cn('p-4 text-center transition-transform duration-200 hover:-translate-y-1 md:p-5', isFailed && 'border border-rose-300 bg-rose-50/30')}>
                          <p className="text-xs font-semibold tracking-[0.18em] text-violet-700 uppercase">第 {segment.order} 页</p>
                          <p className="mt-2 text-sm font-bold line-clamp-2">{segment.title}</p>
                          <div className="mt-4 text-xs">
                            {segment.imageUrl ? (
                              <span className="text-emerald-600">插画已完成</span>
                            ) : isGenerating ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                                <span className="text-amber-600">绘制中...</span>
                                <span className="text-xs text-muted-foreground">正在生成，稍等一会会...</span>
                              </div>
                            ) : isFailed ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <span className="text-rose-600">生成失败</span>
                                {segment.errorMessage && (
                                  <p
                                    className="line-clamp-3 max-w-full rounded bg-rose-50 px-2 py-1 text-left text-[11px] leading-snug text-rose-700 break-words"
                                    title={segment.errorMessage}
                                  >
                                    {segment.errorMessage}
                                  </p>
                                )}
                                <button
                                  onClick={async () => {
                                    if (illustrationLockRef.current || isIllustrating) return;
                                    const sceneIndex = segment.order - 1;
                                    setRetryingSceneIndices((prev) => {
                                      const next = new Set(prev);
                                      next.add(sceneIndex);
                                      return next;
                                    });
                                    try {
                                      const storyboardSceneIndex = (story.storyboard.scenes[segment.order - 1]?.index ?? sceneIndex);
                                      const { retrySingleIllustration } = await import('@/lib/api/story');
                                      await retrySingleIllustration(storyId, storyboardSceneIndex);
                                      await refreshIllustrations();
                                    } catch (e) {
                                      console.error('重试失败:', e);
                                      showError(`重试失败: ${e instanceof Error ? e.message : '未知错误'}`);
                                    } finally {
                                      setRetryingSceneIndices((prev) => {
                                        const next = new Set(prev);
                                        next.delete(sceneIndex);
                                        return next;
                                      });
                                    }
                                  }}
                                  disabled={isIllustrating || illustrationLockRef.current}
                                  className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 hover:underline disabled:opacity-50"
                                >
                                  {retryingSceneIndices.has(segment.order - 1) ? (
                                    <>
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                      正在重新生成中…
                                    </>
                                  ) : (
                                    '重试'
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">等待生成绘本</span>
                            )}
                          </div>
                        </GlassCard>
                      </StaggerItem>
                    );
                  })}
                </StaggerList>
              </>
            ) : (
              <FadeIn>
                <div className="space-y-4">
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)} className="rounded-full">
                    <ArrowLeft className="h-4 w-4" />
                    返回概览
                  </Button>
                  <StoryPreview story={story} onSegmentsChange={handleSegmentsChange} onStartIllustration={() => {
                        if (isIllustrating || illustrationLockRef.current) {
                          showError('正在生成绘本中，请稍候...');
                          return;
                        }
                        handleStartIllustration(storyState.hasIllustrations);
                      }} isIllustrating={isIllustrating} />
                </div>
              </FadeIn>
            )}
          </StaggerList>
        )}

        {storyState.isStoryCompleted && !storyState.hasSegments && (
          <FadeIn>
            <GlassCard className="p-5 text-center md:p-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">故事内容正在加载中，请稍候...</p>
              <Button variant="outline" onClick={() => loadStory(storyId)} className="mt-4 rounded-full">
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
            </GlassCard>
          </FadeIn>
        )}

        {displayError && <div className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">{displayError}</div>}

        {storyState.isStoryCompleted && (
          <FadeIn delay={0.12}>
            <GlassCard className="p-5 md:p-6">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-1 h-5 w-5 text-amber-500" />
                <p className="text-sm leading-7 text-muted-foreground">完成故事后建议先快速阅读一遍，如果剧情节奏和标题都满意，再生成插画和后续视频，成品会更连贯。{storyState.allIllustrationsCompleted ? ' 当前插画已全部完成，可以直接前往“我的作品”查看成品。' : ''}</p>
              </div>
            </GlassCard>
          </FadeIn>
        )}
      </div>
    </>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <GenerateContent />
    </Suspense>
  );
}



