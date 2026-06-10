'use client';

import { Suspense, useCallback, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreationStepper } from '@/components/ui/creation-stepper';
import { CharacterStylizer } from '@/components/ui/character-stylizer';
import { CustomStyleEditor, ConfirmDialog } from '@/components/ui/custom-style-editor';
import { useCharacter } from '@/hooks/useCharacter';
import { useStory } from '@/hooks/useStory';
import { useToast } from '@/components/ui/toast';
import { GlassCard } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import type { CustomStylePrompt, StyleInput } from '@/types/character';
import {
  customStyleIdFromValue,
  customStyleValue,
  isCustomStyleValue,
  isPresetStyleValue,
} from '@/components/ui/style-selector';
import {
  deleteCustomStyle,
  listCustomStyles,
} from '@/lib/api/style';

function StylizeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams?.get('characterId') ?? null;
  const storyId = searchParams?.get('storyId') ?? null;
  const { success: showToast, error: showError } = useToast();
  const { story, loadStory } = useStory();
  // `selectedStyle` is a string union of preset keys and `custom:<id>`.
  // We resolve it into a real StyleInput only at submit time so the picker
  // UI stays decoupled from the wire shape.
  const [selectedStyle, setSelectedStyle] = useState<string>('pixar');
  const [stylizeDone, setStylizeDone] = useState(false);
  const [customStyles, setCustomStyles] = useState<CustomStylePrompt[]>([]);
  const [customLoading, setCustomLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<CustomStylePrompt | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomStylePrompt | null>(null);
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

  // Load the caller's custom styles on mount. Failures are non-fatal — the
  // preset cards still work even if the custom styles endpoint is down.
  const refreshCustomStyles = useCallback(async () => {
    setCustomLoading(true);
    try {
      const list = await listCustomStyles();
      setCustomStyles(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取自定义风格失败';
      // Toast but don't unmount — picker still works with the 8 presets.
      showError(message);
    } finally {
      setCustomLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    refreshCustomStyles();
  }, [refreshCustomStyles]);

  // If the currently selected custom style disappears (e.g. user deletes it
  // from elsewhere), gracefully fall back to the first preset.
  useEffect(() => {
    if (!isCustomStyleValue(selectedStyle)) return;
    const id = customStyleIdFromValue(selectedStyle);
    if (id && !customStyles.some((s) => s.id === id)) {
      setSelectedStyle('pixar');
    }
  }, [customStyles, selectedStyle]);

  const resolveStyleInput = useCallback(
    (value: string): StyleInput => {
      if (isPresetStyleValue(value)) return value;
      if (isCustomStyleValue(value)) {
        const id = customStyleIdFromValue(value);
        const match = id ? customStyles.find((s) => s.id === id) : null;
        if (match) {
          return {
            id: match.id,
            name: match.name,
            prompt: match.prompt,
            colorTheme: match.colorTheme,
            iconName: match.iconName,
          };
        }
      }
      return 'pixar';
    },
    [customStyles]
  );

  const handleStylize = useCallback(async () => {
    if (stylizeLockRef.current || isStylizing) return;
    stylizeLockRef.current = true;
    const styleInput = resolveStyleInput(selectedStyle);
    const result = await stylize(styleInput, story?.title);
    stylizeLockRef.current = false;
    if (result) {
      showToast('风格化完成！');
      setStylizeDone(true);
    }
  }, [selectedStyle, story?.title, stylize, showToast, isStylizing, resolveStyleInput]);

  const handleContinue = useCallback(() => {
    if (isStylizing) return;
    if (storyId) router.push(`/create/generate?storyId=${storyId}`);
    else if (characterId) router.push(`/create/story?characterId=${characterId}`);
  }, [characterId, storyId, router, isStylizing]);

  const openCreate = useCallback(() => {
    setEditingStyle(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    const target = customStyles.find((s) => s.id === id) ?? null;
    setEditingStyle(target);
    setEditorOpen(true);
  }, [customStyles]);

  const requestDelete = useCallback((id: string) => {
    const target = customStyles.find((s) => s.id === id) ?? null;
    setPendingDelete(target);
  }, [customStyles]);

  const confirmDelete = useCallback(async () => {
    const target = pendingDelete;
    if (!target) return;
    try {
      await deleteCustomStyle(target.id);
      setCustomStyles((prev) => prev.filter((s) => s.id !== target.id));
      // If the deleted style was the active selection, fall back to the
      // first preset so the user isn't stranded on an empty selection.
      if (selectedStyle === customStyleValue(target.id)) {
        setSelectedStyle('pixar');
      }
      showToast('自定义风格已删除');
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      showError(message);
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, selectedStyle, showToast, showError]);

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
                customStyles={customStyles}
                onCreateCustom={openCreate}
                onEditCustom={openEdit}
                onDeleteCustom={requestDelete}
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

      {/* Quietly log customLoading so an empty list during the initial fetch
          doesn't look like "the user has no custom styles" — keeping the
          state in scope also lets us flip the empty-card UI later. */}
      {customLoading && customStyles.length === 0 ? null : null}

      <CustomStyleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editingStyle}
        onSaved={(saved) => {
          // Optimistic merge into the local list, then re-fetch from the
          // server so a rejected save doesn't leave a stale row in state.
          setCustomStyles((prev) => {
            const next = prev.filter((s) => s.id !== saved.id);
            next.unshift(saved);
            return next;
          });
          // Promote the freshly-saved style to the active selection so the
          // user can immediately apply it without a second click.
          setSelectedStyle(customStyleValue(saved.id));
          // Re-sync in the background to pick up server-side timestamps.
          refreshCustomStyles();
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除自定义风格？"
        message={
          pendingDelete ? (
            <span>
              即将删除「<span className="font-semibold text-foreground/80">{pendingDelete.name}</span>」,此操作不可撤销。
            </span>
          ) : null
        }
        confirmLabel="删除"
        cancelLabel="再想想"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
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
