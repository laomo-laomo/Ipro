'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, BookImage, Video, ArrowLeft, Trash2, Loader2 } from 'lucide-react';
import { IllustrationCard } from '@/components/illustration/IllustrationCard';
import { StoryGridSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { GlassCard, MagicButton } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import { useGallery } from '@/hooks/useGallery';
import { useCharacter } from '@/hooks/useCharacter';
import { useToast } from '@/components/ui/toast';

type TabKey = 'home' | 'characters' | 'books' | 'videos';

const TABS: { key: TabKey; label: string; icon: typeof User; description: string }[] = [
  { key: 'characters', label: '我的角色', icon: User, description: '已生成的角色定稿形象' },
  { key: 'books', label: '我的绘本', icon: BookImage, description: '已创作的完整故事绘本' },
  { key: 'videos', label: '我的视频', icon: Video, description: '已生成的故事视频' },
];

export default function GalleryPage() {
  const router = useRouter();
  const { stories, allStories, isLoading, isLoadingMore, error, hasMore, loadStories, loadMoreStories, deleteStory } = useGallery();
  const { characters, loadCharacters, removeCharacter } = useCharacter();
  const { success: showToast, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const handleDelete = useCallback(async (storyId: string) => {
    try {
      await deleteStory(storyId);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [deleteStory]);

  const handleDeleteCharacter = useCallback(async (characterId: string) => {
    try {
      await removeCharacter(characterId);
      showToast('角色已删除');
    } catch {
      showError('删除失败');
    }
  }, [removeCharacter, showToast, showError]);

  const handleCreateNew = useCallback(() => {
    router.push('/create/upload');
  }, [router]);

  const styledCharacters = characters.filter((character) => character.stylizedPhotoUrl);

  // Filter applied to the full set — these are used to drive the home tab counts so
  // they reflect reality, not "however many the user has paged through".
  const isReadableStory = (story: (typeof allStories)[number]) => {
    const segments = story.segments || [];
    const hasSegments = segments.length > 0;
    const hasIllustration = segments.some((segment) => Boolean(segment.imageUrl));
    const isReadableStatus = story.status === 'completed' || story.status === 'illustrating' || story.status === 'rendering';
    return hasSegments && hasIllustration && isReadableStatus;
  };
  const hasVideo = (story: (typeof allStories)[number]) => Boolean((story as { videoUrl?: string }).videoUrl);

  const totalReadableCount = allStories.filter(isReadableStory).length;
  const totalVideoCount = allStories.filter(hasVideo).length;

  // For the in-tab list view, use the loaded subset so "加载更多" actually appends.
  const readableStories = stories.filter(isReadableStory);
  const storiesWithVideo = stories.filter(hasVideo);

  if (activeTab === 'characters') {
    return (
      <div className="page-shell page-enter space-y-5 md:space-y-6">
        <FadeIn>
          <div className="flex items-center gap-3 md:gap-4">
            <Button variant="ghost" size="sm" onClick={() => setActiveTab('home')} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
            <div>
              <p className="text-sm font-medium text-rose-600">我的角色</p>
              <h1 className="text-2xl font-bold md:text-3xl">已生成的角色形象</h1>
            </div>
          </div>
        </FadeIn>
        {styledCharacters.length === 0 ? (
          <FadeIn>
            <GlassCard className="p-8 text-center md:p-12">
              <User className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">还没有生成过角色形象</p>
              <MagicButton onClick={handleCreateNew} className="mt-4">开始创作</MagicButton>
            </GlassCard>
          </FadeIn>
        ) : (
          <StaggerList className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
            {styledCharacters.map((character) => (
              <StaggerItem key={character.id}>
                <div className="group relative overflow-hidden rounded-[20px] border border-white/70 bg-white/82 shadow-paper transition-all hover:-translate-y-1 hover:shadow-lg md:rounded-[24px]">
                  <div className="aspect-square overflow-hidden">
                    <img src={character.stylizedPhotoUrl!} alt="角色定稿" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  <div className="p-3">
                    <p className="truncate text-xs text-muted-foreground">{character.featureDesc || '角色形象'}</p>
                  </div>
                  <div
                    onClick={() => handleDeleteCharacter(character.id)}
                    className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </div>
    );
  }

  if (activeTab === 'books') {
    return (
      <div className="page-shell page-enter space-y-5 md:space-y-6">
        <FadeIn>
          <div className="flex items-center gap-3 md:gap-4">
            <Button variant="ghost" size="sm" onClick={() => setActiveTab('home')} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
            <div>
              <p className="text-sm font-medium text-violet-700">我的绘本</p>
              <h1 className="text-2xl font-bold md:text-3xl">已创作的故事绘本</h1>
              <p className="mt-2 text-sm text-muted-foreground">这里只展示已经有内容可翻阅的绘本，避免半成品点开后报错。</p>
            </div>
          </div>
        </FadeIn>
        {readableStories.length === 0 ? (
          <FadeIn>
            <GlassCard className="p-8 text-center md:p-12">
              <BookImage className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">还没有可翻阅的绘本</p>
              <MagicButton onClick={handleCreateNew} className="mt-4">开始创作</MagicButton>
            </GlassCard>
          </FadeIn>
        ) : (
          <>
            <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
              {readableStories.map((story) => (
                <StaggerItem key={story.id}>
                  <IllustrationCard story={story} onDelete={handleDelete} />
                </StaggerItem>
              ))}
            </StaggerList>
            {hasMore && (
              <FadeIn>
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={loadMoreStories}
                    disabled={isLoadingMore}
                    className="rounded-full px-8"
                  >
                    {isLoadingMore ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> 加载中...</>
                    ) : (
                      <>加载更多绘本</>
                    )}
                  </Button>
                </div>
              </FadeIn>
            )}
          </>
        )}
      </div>
    );
  }

  if (activeTab === 'videos') {
    return (
      <div className="page-shell page-enter space-y-5 md:space-y-6">
        <FadeIn>
          <div className="flex items-center gap-3 md:gap-4">
            <Button variant="ghost" size="sm" onClick={() => setActiveTab('home')} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
            <div>
              <p className="text-sm font-medium text-amber-600">我的视频</p>
              <h1 className="text-2xl font-bold md:text-3xl">已生成的故事视频</h1>
            </div>
          </div>
        </FadeIn>
        {storiesWithVideo.length === 0 ? (
          <FadeIn>
            <GlassCard className="p-8 text-center md:p-12">
              <Video className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">还没有生成过视频</p>
              <MagicButton onClick={handleCreateNew} className="mt-4">开始创作</MagicButton>
            </GlassCard>
          </FadeIn>
        ) : (
          <>
            <StaggerList className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
              {storiesWithVideo.map((story) => (
                <StaggerItem key={story.id}>
                  <IllustrationCard story={story} onDelete={handleDelete} />
                </StaggerItem>
              ))}
            </StaggerList>
            {hasMore && (
              <FadeIn>
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={loadMoreStories}
                    disabled={isLoadingMore}
                    className="rounded-full px-8"
                  >
                    {isLoadingMore ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> 加载中...</>
                    ) : (
                      <>加载更多视频</>
                    )}
                  </Button>
                </div>
              </FadeIn>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page-shell page-enter space-y-5 md:space-y-8">
      <FadeIn>
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:gap-5">
          <div>
            <p className="text-sm font-medium text-violet-700">我的作品</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">每一本都来自你们家的主角光环</h1>
          </div>
          <MagicButton onClick={handleCreateNew} size="lg" className="px-7">
            创建新故事
          </MagicButton>
        </section>
      </FadeIn>

      {isLoading && stories.length === 0 && characters.length === 0 && <StoryGridSkeleton />}

      <StaggerList className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          // Home-tab counts always reflect the full set, not "however many have been paged through".
          const count = tab.key === 'characters'
            ? styledCharacters.length
            : tab.key === 'books'
              ? totalReadableCount
              : totalVideoCount;

          return (
            <StaggerItem key={tab.key}>
              <button
                onClick={() => setActiveTab(tab.key)}
                className="group w-full overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 text-left shadow-paper transition-all hover:-translate-y-1 hover:shadow-lg md:rounded-[28px] md:p-6"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700 transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-xl font-bold">{tab.label}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{tab.description}</p>
                <p className="mt-3 text-2xl font-extrabold text-violet-700">{count}</p>
              </button>
            </StaggerItem>
          );
        })}
      </StaggerList>

      {error && (
        <FadeIn>
          <GlassCard className="mx-auto max-w-md p-6 text-center">
            <p className="text-lg font-bold text-destructive">加载失败</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => loadStories(1)}>
              重试
            </Button>
          </GlassCard>
        </FadeIn>
      )}
    </div>
  );
}
