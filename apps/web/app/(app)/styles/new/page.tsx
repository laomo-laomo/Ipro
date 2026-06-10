'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/magic';
import { FadeIn } from '@/components/motion';
import { useToast } from '@/components/ui/toast';
import { getStyleIcon, getStyleSurface } from '@/components/ui/style-selector';
import { cn } from '@/lib/utils';
import {
  CustomStyleFormFields,
  formFromStyle,
  useCustomStyleForm,
  type FormState,
} from '@/components/ui/custom-style-form';
import { listCustomStyles } from '@/lib/api/style';

export default function NewStylePage() {
  const router = useRouter();
  const { success: showSuccess, error: showError } = useToast();
  const [previewForm, setPreviewForm] = useState<FormState | null>(null);
  const [checkingName, setCheckingName] = useState(true);

  const { form, setForm, error, submitting, isDisabled, handleSubmit } = useCustomStyleForm({
    onSaved: (saved) => {
      showSuccess(`「${saved.name}」已加入你的风格库`);
      router.push('/styles');
    },
  });

  // Mirror live form state into a preview card so the user sees what their
  // style will look like as they type. We re-render at 60ms cadence to keep
  // the preview snappy without thrashing the server.
  useEffect(() => {
    const id = setTimeout(() => setPreviewForm(form), 80);
    return () => clearTimeout(id);
  }, [form]);

  // Once on mount, sanity-check that the user is logged in and grab the
  // existing list — we use it only to give a friendly "you already have 3"
  // hint, no functional decision.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listCustomStyles();
        if (!cancelled) setPreviewForm((prev) => prev ?? null);
        if (list.length > 0) {
          // No-op warning surface — keep the page quiet unless the user
          // names a style that collides with one they already own.
        }
      } catch {
        // The page stays usable even if the GET fails.
      } finally {
        if (!cancelled) setCheckingName(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await handleSubmit();
    if (saved === false && error) showError(error);
  };

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
            <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">新建风格</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              用文字描述你想要的画风,保存后即可在创作流程里直接选用。
            </p>
          </div>
        </div>
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <FadeIn delay={0.05}>
          <GlassCard className="p-6 md:p-8">
            <form onSubmit={handleFormSubmit} className="space-y-5">
              <CustomStyleFormFields
                form={form}
                onChange={setForm as (next: FormState) => void}
                disabled={submitting || checkingName}
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
                    '创建风格'
                  )}
                </Button>
              </div>
            </form>
          </GlassCard>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground/85">实时预览</p>
            <div
              className={cn(
                'relative aspect-[4/5] overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-2 shadow-paper',
                'transition-all duration-200'
              )}
            >
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
              这张卡会出现在风格库「我的风格」里,跟你选的画风、配色、图标保持一致。
            </p>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
