'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import { FadeIn } from '@/components/motion';
import { useToast } from '@/components/ui/toast';
import { getStyleIcon, getStyleSurface } from '@/components/ui/style-selector';
import { cn } from '@/lib/utils';
import {
  CustomStyleFormFields,
  useCustomStyleForm,
  type FormState,
} from '@/components/ui/custom-style-form';
import { ConfirmDialog } from '@/components/ui/custom-style-editor';
import {
  deleteCustomStyle,
  listCustomStyles,
} from '@/lib/api/style';
import type { CustomStylePrompt } from '@/types/character';

export default function EditStylePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { success: showSuccess, error: showError } = useToast();
  const [editing, setEditing] = useState<CustomStylePrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [previewForm, setPreviewForm] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { form, setForm, error, submitting, isDisabled, handleSubmit } = useCustomStyleForm({
    initial: editing,
    editingId: id,
    onSaved: (saved) => {
      showSuccess(`「${saved.name}」已更新`);
      router.push('/styles');
    },
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listCustomStyles();
        if (cancelled) return;
        const match = list.find((s) => s.id === id) ?? null;
        if (match) {
          setEditing(match);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '读取风格失败';
        showError(message);
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, showError]);

  useEffect(() => {
    const id = setTimeout(() => setPreviewForm(form), 80);
    return () => clearTimeout(id);
  }, [form]);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await handleSubmit();
    if (saved === false && error) showError(error);
  };

  const confirmDelete = async () => {
    if (!editing || deleting) return;
    setDeleting(true);
    try {
      await deleteCustomStyle(editing.id);
      showSuccess(`「${editing.name}」已删除`);
      router.push('/styles');
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      showError(message);
    } finally {
      setDeleting(false);
      setPendingDelete(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !editing) {
    return (
      <div className="page-shell page-enter space-y-4">
        <Link href="/styles" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 返回风格库
        </Link>
        <GlassCard className="p-8 text-center">
          <h2 className="text-xl font-bold">找不到这个风格</h2>
          <p className="mt-2 text-sm text-muted-foreground">可能已经被删除,或者链接失效了。</p>
          <Button asChild variant="magic" className="mt-5 rounded-full">
            <Link href="/styles">回到风格库</Link>
          </Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="page-shell page-enter space-y-6 pb-28 md:space-y-8">
      <FadeIn>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href="/styles"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> 返回风格库
            </Link>
            <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">编辑风格</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              调整「{editing.name}」的描述、配色或图标。修改会立即同步到你后续的创作流程中。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPendingDelete(true)}
            className="rounded-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={submitting}
          >
            <Trash2 className="h-4 w-4" /> 删除
          </Button>
        </div>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <FadeIn delay={0.05}>
          <GlassCard className="p-6 md:p-8">
            <form onSubmit={handleFormSubmit} className="space-y-5">
              <CustomStyleFormFields
                form={form}
                onChange={setForm as (next: FormState) => void}
                disabled={submitting}
                error={error}
              />
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/styles')}
                  disabled={submitting}
                  className="rounded-full"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="magic"
                  className="rounded-full"
                  disabled={isDisabled}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      保存中…
                    </>
                  ) : (
                    '保存修改'
                  )}
                </Button>
              </div>
            </form>
          </GlassCard>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground/85">实时预览</p>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-2 shadow-paper">
              <div
                className={cn(
                  'relative h-full overflow-hidden rounded-[20px] bg-gradient-to-br p-4',
                  getStyleSurface(previewForm?.colorTheme ?? form.colorTheme)
                )}
              >
                <div className="relative flex h-full flex-col justify-between rounded-[16px] border border-white/60 bg-white/30 p-3 backdrop-blur-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-violet-700 shadow-sm">
                    {getStyleIcon(previewForm?.iconName ?? form.iconName)}
                  </div>
                  <div className="rounded-[16px] bg-black/10 p-3 backdrop-blur-[2px]">
                    <p className="text-sm font-bold text-magic-ink">
                      {previewForm?.name?.trim() || '未命名风格'}
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-magic-ink/75">
                      {previewForm?.prompt?.trim() || '写一段描述,这里会实时同步。'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              实时同步当前正在编辑的字段。保存后这里的样式会成为「我的风格」中卡片的最终外观。
            </p>
          </div>
        </FadeIn>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        title="删除自定义风格?"
        message={
          <span>
            即将删除<span className="font-semibold text-foreground/80">{editing.name}</span>,此操作不可撤销。
          </span>
        }
        confirmLabel={deleting ? '删除中…' : '删除'}
        cancelLabel="再想想"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(false)}
      />
    </div>
  );
}
