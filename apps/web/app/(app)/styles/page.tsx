'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Palette, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard, MagicButton } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import { StyleSelector } from '@/components/ui/style-selector';
import { ConfirmDialog } from '@/components/ui/custom-style-editor';
import {
  deleteCustomStyle,
  listCustomStyles,
} from '@/lib/api/style';
import type { CustomStylePrompt } from '@/types/character';
import { useToast } from '@/components/ui/toast';

export default function StylesIndexPage() {
  const router = useRouter();
  const { error: showError, success: showToast } = useToast();
  const [customStyles, setCustomStyles] = useState<CustomStylePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<CustomStylePrompt | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCustomStyles();
      setCustomStyles(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取自定义风格失败';
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleEdit = (id: string) => router.push(`/styles/${id}`);
  const handleCreate = () => router.push('/styles/new');

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteCustomStyle(pendingDelete.id);
      setCustomStyles((prev) => prev.filter((s) => s.id !== pendingDelete.id));
      showToast(`已删除「${pendingDelete.name}」`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      showError(message);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }, [pendingDelete, deleting, showToast, showError]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-shell page-enter space-y-6 pb-28 md:space-y-8">
      <FadeIn>
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-rose-600">风格库</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">挑一种风格,讲一个故事</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-3 md:text-base md:leading-8">
              8 种预设画风,加上你自己的珍藏。可以随时新建,也可以挑一个进绘本创作直接用。
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:flex-shrink-0">
            <MagicButton href="/styles/new" size="lg" className="px-6">
              <Plus className="h-4 w-4" /> 新建风格
            </MagicButton>
            <Button asChild variant="ghost" size="lg" className="rounded-full">
              <Link href="/create/upload">
                <Sparkles className="h-4 w-4" /> 去创作
              </Link>
            </Button>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.05}>
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold md:text-xl">预设画风 · 8 种</h2>
            <span className="text-xs text-muted-foreground md:text-sm">随选随用,系统调好的 prompt 模板</span>
          </div>
          <StyleSelector
            selectedStyle=""
            onStyleChange={() => {
              // Preview-only on this page. Users head to /create/upload to actually
              // pick a style for their next story.
            }}
            disabled
            className="pointer-events-none opacity-90"
          />
        </section>
      </FadeIn>

      <FadeIn delay={0.1}>
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold md:text-xl">我的风格</h2>
            <span className="text-xs text-muted-foreground md:text-sm">点击卡片可以编辑或删除</span>
          </div>
          {customStyles.length === 0 ? (
            <GlassCard className="flex flex-col items-center justify-center px-5 py-12 text-center md:py-16">
              <Palette className="h-12 w-12 text-violet-300 md:h-14 md:w-14" />
              <h3 className="mt-4 text-xl font-bold md:text-2xl">还没有专属画风</h3>
              <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">
                用一段文字描述你想要的氛围——比如「赛博朋克霓虹 + 黑灰 + 暖光轮廓」,系统会把这段描述存成你专属的风格模板。
              </p>
              <MagicButton href="/styles/new" size="lg" className="mt-5 px-7">
                <Plus className="h-4 w-4" /> 立刻新建
              </MagicButton>
            </GlassCard>
          ) : (
            <StaggerList className="space-y-4">
              <StaggerItem>
                <StyleSelector
                  selectedStyle=""
                  onStyleChange={() => {}}
                  customStyles={customStyles}
                  onEditCustom={handleEdit}
                  onDeleteCustom={(id) => {
                    const target = customStyles.find((s) => s.id === id) ?? null;
                    setPendingDelete(target);
                  }}
                  className="pointer-events-auto"
                />
              </StaggerItem>
            </StaggerList>
          )}
        </section>
      </FadeIn>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除自定义风格?"
        message={
          pendingDelete ? (
            <span>
              即将删除<span className="font-semibold text-foreground/80">{pendingDelete.name}</span>,此操作不可撤销。
            </span>
          ) : null
        }
        confirmLabel={deleting ? '删除中…' : '删除'}
        cancelLabel="再想想"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
