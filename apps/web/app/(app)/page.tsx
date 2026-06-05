'use client';

import Link from 'next/link';
import { ArrowRight, Crown, Sparkles, Stars, Wand2 } from 'lucide-react';
import { FloatingParticles, GlassCard, MagicButton } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';

const FLOW_STEPS = [
  {
    title: '上传照片',
    description: '把宝宝清晰的笑脸交给我们，童话主角就此登场。',
    icon: '📷',
  },
  {
    title: 'AI 魔法创作',
    description: '从角色风格到故事线，像翻开一本会发光的绘本。',
    icon: '🪄',
  },
  {
    title: '收获专属绘本',
    description: '一键预览、下载、分享，把故事留在家人的记忆里。',
    icon: '📖',
  },
];

const TEMPLATE_PREVIEWS = [
  {
    title: '小红帽',
    subtitle: '勇敢穿越森林的暖心冒险',
    gradient: 'from-rose-300 via-pink-200 to-amber-100',
    accent: 'bg-rose-500',
  },
  {
    title: '白雪公主',
    subtitle: '玻璃城堡与七个好朋友',
    gradient: 'from-sky-300 via-cyan-100 to-white',
    accent: 'bg-sky-500',
  },
  {
    title: '三只小猪',
    subtitle: '盖房子的欢乐成长课',
    gradient: 'from-orange-300 via-amber-100 to-yellow-50',
    accent: 'bg-amber-500',
  },
  {
    title: '灰姑娘',
    subtitle: '星光舞会里的温柔奇迹',
    gradient: 'from-violet-300 via-fuchsia-100 to-pink-50',
    accent: 'bg-violet-500',
  },
];

const TESTIMONIALS = [
  '孩子看到自己出现在故事里，整晚都抱着平板舍不得放下。',
  '原来 AI 可以这么有温度，像是为我们家专门写了一本睡前故事。',
  '从照片到绘本只花了几分钟，成品居然像真正出版的小书。',
];

const MEMBERSHIP = [
  { name: '免费体验', price: '¥0', detail: '试试第一次魔法' },
  { name: '月卡', price: '¥59', detail: '每月稳定创作' },
  { name: '年卡', price: '¥499', detail: '平均每个故事更划算' },
];

export default function HomePage() {
  return (
    <div className="relative overflow-hidden page-enter">
      <section className="relative isolate border-b border-white/40">
        <FloatingParticles count={8} />
        <div className="page-shell pt-10 sm:pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <FadeIn className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/85 px-4 py-2 text-sm text-violet-700 shadow-sm">
                <Stars className="h-4 w-4 text-amber-500" />
                已为 10,000+ 家庭创造专属童话
              </span>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.08] text-foreground sm:text-6xl">
                  把宝宝变成
                  <span className="storybook-title block text-gradient-magic">童话故事的主角</span>
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                  上传一张照片，AI 会像翻开一本精装绘本那样，为你展开角色、故事和插画。每一次创作，都是送给孩子的一场小小魔法。
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <MagicButton href="/create" size="lg" className="px-8">
                  开始创作我的童话
                </MagicButton>
                <Link href="/gallery" className="inline-flex items-center justify-center gap-2 rounded-full border border-border/80 bg-white/88 px-6 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:shadow-paper">
                  先看看大家的作品
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </FadeIn>

            <FadeIn delay={0.08}>
              <GlassCard className="overflow-hidden p-0">
                <div className="relative aspect-[4/5] bg-gradient-to-br from-violet-100 via-rose-50 to-amber-50">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400" />
                  <div className="absolute inset-0 opacity-80">
                    <div className="absolute left-10 top-10 h-24 w-24 rounded-full bg-white/20 blur-xl" />
                    <div className="absolute right-10 top-24 h-16 w-16 rounded-full bg-white/20 blur-lg" />
                    <div className="absolute bottom-10 left-12 h-20 w-20 rounded-full bg-white/15 blur-lg" />
                  </div>
                  <div className="absolute left-5 top-5 rounded-full bg-white/88 px-3 py-1 text-xs font-medium text-violet-700 shadow-sm">绘本封面预览</div>
                  <div className="absolute inset-x-5 bottom-5 rounded-[24px] border border-white/60 bg-white/72 p-5 backdrop-blur-md">
                    <p className="text-sm font-medium text-violet-700">今晚，星星会给你讲一个勇敢的故事。</p>
                    <p className="mt-2 text-sm leading-7 text-foreground/75">从照片到绘本，只需要几步，就能做出一份孩子愿意反复翻看的睡前故事。</p>
                  </div>
                </div>
              </GlassCard>
            </FadeIn>
          </div>
        </div>
      </section>

      <section className="page-shell pt-8">
        <StaggerList className="grid gap-4 md:grid-cols-3">
          {FLOW_STEPS.map((step, index) => (
            <StaggerItem key={step.title}>
              <GlassCard className="p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-paper">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-3xl">{step.icon}</span>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">0{index + 1}</span>
                </div>
                <h2 className="text-lg font-bold">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </GlassCard>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      <section className="page-shell pt-0">
        <FadeIn delay={0.06}>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-600">精选童话模板</p>
              <h2 className="text-2xl font-bold sm:text-3xl">先挑一本你想翻开的故事</h2>
            </div>
            <Link href="/create" className="hidden items-center gap-2 text-sm font-medium text-violet-700 sm:inline-flex">
              查看全部模板
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </FadeIn>
        <StaggerList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TEMPLATE_PREVIEWS.map((template) => (
            <StaggerItem key={template.title}>
              <Link href="/create" className="group rounded-[28px] border border-white/70 bg-white/82 p-3 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-paper">
                <div className={`relative aspect-[3/4] overflow-hidden rounded-[22px] bg-gradient-to-br ${template.gradient} p-4`}>
                  <div className="absolute inset-0 opacity-80">
                    <div className="absolute -left-6 top-6 h-24 w-24 rounded-full bg-white/20 blur-xl" />
                    <div className="absolute right-4 top-8 h-14 w-14 rounded-full bg-white/25 blur-md" />
                    <div className="absolute bottom-6 left-6 h-20 w-20 rounded-full bg-white/20 blur-lg" />
                  </div>
                  <div className="relative flex h-full flex-col justify-between rounded-[18px] border border-white/50 bg-white/20 p-4 backdrop-blur-[1px]">
                    <div className="flex items-center justify-between">
                      <span className="w-fit rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-violet-700">AI 封面</span>
                      <Sparkles className="h-4 w-4 text-white/80" />
                    </div>
                    <div className="space-y-4">
                      <div className={`h-2 w-14 rounded-full opacity-90 ${template.accent}`} />
                      <div className={`h-2 w-24 rounded-full opacity-80 ${template.accent}`} />
                      <div className={`h-2 w-10 rounded-full opacity-70 ${template.accent}`} />
                    </div>
                    <div className="rounded-[18px] bg-black/10 p-3 backdrop-blur-[2px]">
                      <p className="text-lg font-bold text-magic-ink">{template.title}</p>
                      <p className="mt-1 text-sm leading-6 text-magic-ink/70">{template.subtitle}</p>
                    </div>
                  </div>
                </div>
              </Link>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      <section className="page-shell pt-0">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <FadeIn delay={0.08}>
            <GlassCard className="p-6 sm:p-8">
              <div className="mb-6">
                <p className="text-sm font-medium text-rose-600">家长反馈</p>
                <h2 className="mt-2 text-2xl font-bold">孩子会记住这份惊喜</h2>
              </div>
              <div className="space-y-4">
                {TESTIMONIALS.map((quote, index) => (
                  <blockquote key={quote} className="rounded-[24px] border border-rose-100 bg-rose-50/70 p-5 text-sm leading-7 text-foreground/80">
                    “{quote}”
                    <footer className="mt-3 text-xs font-medium text-rose-500">0{index + 1} / 来自真实家庭体验</footer>
                  </blockquote>
                ))}
              </div>
            </GlassCard>
          </FadeIn>

          <FadeIn delay={0.12}>
            <GlassCard className="p-6 sm:p-8">
              <div className="mb-6">
                <p className="text-sm font-medium text-amber-600">会员方案</p>
                <h2 className="mt-2 text-2xl font-bold">把童话魔法留在每一个夜晚</h2>
              </div>
              <div className="space-y-3">
                {MEMBERSHIP.map((item, index) => (
                  <div key={item.name} className={`rounded-[24px] border p-5 ${index === 2 ? 'border-violet-300 bg-gradient-to-r from-violet-50 to-amber-50 shadow-sm' : 'border-white/70 bg-white/80'}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold">{item.name}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-extrabold text-violet-700">{item.price}</p>
                        {index === 2 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                            <Crown className="h-3.5 w-3.5" />
                            最佳价值
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/membership" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-700">
                查看完整方案
                <ArrowRight className="h-4 w-4" />
              </Link>
            </GlassCard>
          </FadeIn>
        </div>
      </section>

      <section className="page-shell pt-0">
        <FadeIn delay={0.12}>
          <GlassCard className="relative overflow-hidden bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-400 p-8 text-white sm:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_30%)]" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium">
                  <Wand2 className="h-4 w-4" />
                  今晚就开启属于你们家的睡前故事
                </div>
                <h2 className="text-3xl font-bold sm:text-4xl">下一本孩子会反复翻看的绘本，也许今天就能完成。</h2>
              </div>
              <MagicButton href="/create" size="lg" className="border-white/20 bg-white/15 px-8 backdrop-blur-sm">
                立即开始创作
              </MagicButton>
            </div>
          </GlassCard>
        </FadeIn>
      </section>
    </div>
  );
}
