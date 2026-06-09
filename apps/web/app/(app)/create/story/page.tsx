'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Loader2, Wand2 } from 'lucide-react';
import { CreationStepper } from '@/components/ui/creation-stepper';
import { TemplateGrid } from '@/components/story/template-grid';
import { StoryInput } from '@/components/story/story-input';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import { FadeIn } from '@/components/motion';
import { useStory } from '@/hooks/useStory';
import { useCharacter } from '@/hooks/useCharacter';
import { useToast } from '@/components/ui/toast';
import type { StoryTemplate } from '@/types/story';

type SelectionMode = 'template' | 'custom';



function StoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams?.get('characterId') ?? null;
  const { success: showToast, error: showError } = useToast();

  const { isGenerating, generationError, error, generateFromTemplate, generateFromCustomTitle, reset } = useStory();
  const { character, isLoading: isLoadingCharacter, loadCharacter, createDevCharacter } = useCharacter();

  const [mode, setMode] = useState<SelectionMode>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<StoryTemplate | null>(null);
  const [isSeedingCharacter, setIsSeedingCharacter] = useState(false);

  useEffect(() => {
    if (!characterId) return;
    loadCharacter(characterId);

    return () => {
      reset();
    };
  }, [characterId, loadCharacter, reset]);

  const handleTemplateSelect = useCallback((template: StoryTemplate) => {
    setSelectedTemplate(template);
  }, []);

const handleTemplateGenerate = useCallback(async () => {
    if (!characterId || !selectedTemplate) return;
    if (isGenerating) return;

    const result = await generateFromTemplate(characterId, selectedTemplate.id, selectedTemplate.name);
    if (result) {
      router.push(`/create/stylize?characterId=${characterId}&storyId=${result.storyId}`);
    }
  }, [characterId, selectedTemplate, generateFromTemplate, router, isGenerating]);

  const handleCustomGenerate = useCallback(async (customTitle: string) => {
    if (!characterId) return;
    if (isGenerating) return;

    const result = await generateFromCustomTitle(characterId, customTitle);
    if (result) {
      router.push(`/create/stylize?characterId=${characterId}&storyId=${result.storyId}`);
    }
  }, [characterId, generateFromCustomTitle, router, isGenerating]);

  const handleSeedCharacter = useCallback(async () => {
    setIsSeedingCharacter(true);
    try {
      const seeded = await createDevCharacter();
      if (seeded?.characterId) {
        showToast('测试角色已创建，继续选择故事');
        router.replace(`/create/story?characterId=${seeded.characterId}`);
      } else {
        showError('创建测试角色失败');
      }
    } finally {
      setIsSeedingCharacter(false);
    }
  }, [createDevCharacter, router, showToast, showError]);

  if (!characterId) {
    return (
      <div className="page-shell text-center space-y-4">
        <p className="text-muted-foreground">还没有角色信息，请先上传照片并完成风格化。</p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
<Button onClick={() => router.push('/create/upload')} className="rounded-full">
            <ArrowLeft className="h-4 w-4" />
            去上传照片
          </Button>
          <Button onClick={handleSeedCharacter} disabled={isSeedingCharacter || isGenerating} className="rounded-full" variant="magic">
            {isSeedingCharacter ? <><Loader2 className="h-4 w-4 animate-spin" /> 创建中...</> : '使用测试角色继续'}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoadingCharacter) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!character) {
    return (
      <div className="page-shell text-center space-y-4">
        <p className="text-muted-foreground">未找到角色信息</p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
<Button onClick={() => router.push('/create/upload')} className="rounded-full">
            <ArrowLeft className="h-4 w-4" />
            上传照片
          </Button>
          <Button onClick={handleSeedCharacter} disabled={isSeedingCharacter || isGenerating} className="rounded-full" variant="magic">
            {isSeedingCharacter ? <><Loader2 className="h-4 w-4 animate-spin" /> 创建中...</> : '使用测试角色继续'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell page-enter space-y-5 pb-36 md:space-y-6 md:pb-28">
      <FadeIn>
        <section className="space-y-3 md:space-y-4">
          <CreationStepper current="story" characterId={characterId} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:gap-4">
            <div>
              <p className="text-sm font-medium text-amber-600">第三步</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">现在，挑一本要讲给孩子听的故事</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-3 md:text-base md:leading-8">可以直接选经典童话模板，也可以用一句你自己的灵感，把这本绘本变成完全独一无二的冒险。</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push(`/create/stylize?characterId=${characterId}`)} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              返回上一步
            </Button>
          </div>
        </section>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-1">
        <div className="space-y-6">
          <FadeIn delay={0.05}>
            <div className="grid w-full grid-cols-2 rounded-full border border-white/70 bg-white/80 p-1 shadow-sm sm:inline-flex sm:w-auto">
              <button onClick={() => setMode('template')} className={`rounded-full px-5 py-2 text-sm font-medium transition ${mode === 'template' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                <BookOpen className="mr-1 inline-block h-4 w-4" />
                预设模板
              </button>
              <button onClick={() => setMode('custom')} className={`rounded-full px-5 py-2 text-sm font-medium transition ${mode === 'custom' ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                <Wand2 className="mr-1 inline-block h-4 w-4" />
                自定义故事
              </button>
            </div>
          </FadeIn>

          {mode === 'template' && (
            <FadeIn delay={0.08}>
              <TemplateGrid selectedTemplateId={selectedTemplate?.id} onTemplateSelect={handleTemplateSelect} disabled={isGenerating} />
            </FadeIn>
          )}

          {mode === 'custom' && (
            <FadeIn delay={0.08}>
              <div className="max-w-2xl">
                <StoryInput onGenerate={handleCustomGenerate} isGenerating={isGenerating} />
              </div>
            </FadeIn>
          )}
        </div>


      </div>

      {/* Fixed bottom action bar */}
      {selectedTemplate && (
        <div className="mobile-action-bar md:bottom-16">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Button onClick={handleTemplateGenerate} disabled={isGenerating} className="flex-1 rounded-full" size="lg" variant="magic">
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> 生成中...</>
              ) : (
                <><ArrowRight className="h-4 w-4" /> 确认，用「{selectedTemplate.name}」开始生成</>
              )}
            </Button>
          </div>
        </div>
      )}

      {(generationError || error) && <div className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">{generationError || error}</div>}
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <StoryContent />
    </Suspense>
  );
}
