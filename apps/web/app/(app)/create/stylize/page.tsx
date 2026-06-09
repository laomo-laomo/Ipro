'use client';

import { Suspense, useCallback, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreationStepper } from '@/components/ui/creation-stepper';
import { CharacterStylizer } from '@/components/ui/character-stylizer';
import { useCharacter } from '@/hooks/useCharacter';
import { useStory } from '@/hooks/useStory';
import { useToast } from '@/components/ui/toast';
import { GlassCard } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import type { StyleType } from '@/types/character';

function StylizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams?.get('characterId') ?? null;
  const storyId = searchParams?.get('storyId') ?? null;
  const { success: showToast } = useToast();
const { story, loadStory } = useStory();
  const [selectedStyle, setSelectedStyle] = useState<StyleType>('pixar');
  const [stylizeDone, setStylizeDone] = useState(false);
  const { character, isLoading, isStylizing, stylizeError, error, loadCharacter, stylize, resetError } = useCharacter();

// Reset completion state when character changes (e.g., selecting a different photo)
  // Only treat a stylizedPhotoUrl as "completed" if it's a real result, not a dev placeholder
  // Reset stylize done when character changes
  useEffect(() => {
    if (characterId) loadCharacter(characterId);
    if (storyId) loadStory(storyId);
  }, [characterId, storyId, loadCharacter, loadStory]);

  // Reset done flag when character changes (user switched to a different character)
  useEffect(() => {
    if (character?.id) {
      setStylizeDone(false);
    }
  }, [character?.id]);

const stylizeLockRef = useRef(false);

  // Reset lock when character or style changes
  useEffect(() => {
    stylizeLockRef.current = false;
  }, [character?.id, selectedStyle]);

  const handleStylize = useCallback(async () => {
    if (stylizeLockRef.current || isStylizing) return;
    stylizeLockRef.current = true;
    const result = await stylize(selectedStyle, story?.title);
    stylizeLockRef.current = false;
    if (result) {
      showToast('风格化完成！');
      setStylizeDone(true);
    }
  }, [selectedStyle, story?.title, stylize, showToast, isStylizing]);

  const handleContinue = useCallback(() => {
    if (isStylizing) return;
    if (storyId) router.push(`/create/generate?storyId=${storyId}`);
    else if (characterId) router.push(`/create/story?characterId=${characterId}`);
  }, [characterId, storyId, router, isStylizing]);

  return (
    <div className="page-shell page-enter space-y-5 pb-36 md:space-y-6 md:pb-28">
      <FadeIn>
        <section className="space-y-3 md:space-y-4">
          <CreationStepper current="stylize" characterId={characterId || undefined} storyId={storyId || undefined} />
          <div>
            <p className="text-sm font-medium text-rose-600">第二步</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">给主角挑一种绘本里的模样</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-3 md:text-base md:leading-8">从皮克斯感、手绘感到更梦幻的童话画风，这一步决定整本绘本的情绪和气质。{story?.title ? ` 当前故事：${story.title}` : ''}</p>
          </div>
        </section>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <FadeIn delay={0.05}>
          <div>
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !character ? (
              <GlassCard className="p-8 text-center">
                <p className="text-muted-foreground">未找到角色信息，请返回重新上传照片。</p>
              </GlassCard>
) : (
              <CharacterStylizer
                character={character}
                selectedStyle={selectedStyle}
                onStyleChange={(style) => {
                  setSelectedStyle(style);
                  resetError();
                }}
                onStylize={handleStylize}
                onReset={() => {}}
                isStylizing={isStylizing}
                stylizeError={stylizeError}
                disabled={isStylizing}
              />
            )}
          </div>
        </FadeIn>

        <StaggerList className="space-y-4">
          <StaggerItem>
            <GlassCard className="p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper">
              <p className="text-sm font-medium text-rose-600">风格化说明</p>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-muted-foreground">
                <li>AI 会保留人物关键特征，同时转换为统一绘本画风。</li>
                <li>不满意可以重新生成，多试几次更容易遇到喜欢的版本。</li>
                <li>完成后你会带着这个新角色进入故事选择页。</li>
              </ul>
            </GlassCard>
          </StaggerItem>
          <StaggerItem>
            <GlassCard className="p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-1 h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-semibold">小建议</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">如果你更想要温柔童趣的感觉，可以先从色彩柔和、层次更明显的风格开始尝试。</p>
                </div>
              </div>
            </GlassCard>
          </StaggerItem>
        </StaggerList>
      </div>



{/* Fixed bottom action bar */}
      {stylizeDone && character?.stylizedPhotoUrl && (
        <div className="mobile-action-bar md:bottom-16">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Button onClick={handleContinue} className="flex-1 rounded-full" size="lg" variant="magic">
              <ArrowRight className="h-4 w-4" /> 确认风格，继续选故事
            </Button>
          </div>
        </div>
      )}

      {(error || stylizeError) && <div className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">{error || stylizeError}</div>}
    </div>
  );
}

export default function StylizePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <StylizeContent />
    </Suspense>
  );
}
