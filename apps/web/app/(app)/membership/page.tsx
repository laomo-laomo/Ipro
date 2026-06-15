'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Clock, Crown, Sparkles, TicketPercent, Video } from 'lucide-react';
import { useMembership } from '@/hooks/useMembership';
import { MembershipStatus } from '@/components/ui/membership-status';
import { MEMBERSHIP_BENEFITS, MEMBERSHIP_PLANS, type MembershipTier } from '@/types/membership';
import { GlassCard, MagicButton } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const iconMap: Record<string, React.ReactNode> = {
  'book-open': <BookOpen className="h-6 w-6" />,
  video: <Video className="h-6 w-6" />,
  sparkles: <Sparkles className="h-6 w-6" />,
  clock: <Clock className="h-6 w-6" />,
};

const FAQS = [
  {
    title: '会员开通后可以退款吗？',
    answer: '会员服务一经开通通常不支持退款，如遇特殊情况可以联系客服协助处理。',
  },
  {
    title: '会员到期后作品会消失吗？',
    answer: '不会。已经生成的故事和绘本仍然保留，你仍可查看和管理它们。',
  },
  {
    title: '续费后剩余额度会叠加吗？',
    answer: '会，系统会自动把新的会员时长和可用权益叠加到当前账户。',
  },
];

export default function MembershipPage() {
  const {
    membership,
    isLoading,
    isPurchasing,
    error,
    purchaseError,
    lastRedeemResult,
    loadMembershipStatus,
    redeemCode,
  } = useMembership();
  const [redeemCodeValue, setRedeemCodeValue] = useState('');

  useEffect(() => {
    loadMembershipStatus();
  }, [loadMembershipStatus]);

  const handleRedeem = async () => {
    const code = redeemCodeValue.trim();
    if (!code) {
      return;
    }

    const result = await redeemCode(code);
    if (result) {
      setRedeemCodeValue('');
    }
  };

  return (
    <div className="page-shell page-enter space-y-5 md:space-y-8">
      <FadeIn>
        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center md:gap-6">
          <div className="space-y-4 md:space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-medium text-violet-700">
              <Crown className="h-4 w-4 text-amber-500" />
              成为童话魔法师
            </span>
            <div>
              <h1 className="text-3xl font-bold leading-tight sm:text-5xl">把每一个普通夜晚，变成孩子期待的故事时刻。</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-4 md:text-lg md:leading-8">
                会员不仅是更多额度，更是完整解锁绘本下载、视频生成、声音魔法和更流畅的创作节奏。
              </p>
            </div>
            <MagicButton href="#redeem" size="lg" className="px-8">
              输入兑换码，解锁全部魔法
            </MagicButton>
          </div>

          <GlassCard className="p-5 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper sm:p-8">
            <p className="text-sm font-medium text-violet-700">当前状态</p>
            <div className="mt-4">
              <MembershipStatus status={membership} isLoading={isLoading} />
            </div>
            <div className="mt-5 rounded-[22px] bg-gradient-to-r from-violet-50 to-amber-50 p-4 md:mt-6 md:rounded-[24px] md:p-5">
              <p className="text-sm text-muted-foreground">开通方式</p>
              <p className="mt-2 text-2xl font-extrabold text-violet-700 md:text-3xl">销售发码后即时兑换</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">兑换成功后自动叠加会员时长和可用额度。</p>
            </div>
          </GlassCard>
        </section>
      </FadeIn>

      <StaggerList className="grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        {MEMBERSHIP_BENEFITS.map((benefit, index) => (
          <StaggerItem key={index}>
            <GlassCard className="p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-paper md:p-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
                {iconMap[benefit.icon] || <Sparkles className="h-6 w-6" />}
              </div>
              <h2 className="text-lg font-bold">{benefit.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{benefit.description}</p>
            </GlassCard>
          </StaggerItem>
        ))}
      </StaggerList>

      <FadeIn delay={0.06}>
        <section className="space-y-4">
          <div className="text-center">
            <p className="text-sm font-medium text-amber-600">会员套餐</p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">选择适合你的方案</h2>
            <p className="mt-2 text-sm text-muted-foreground">次卡适合体验，周期卡适合长期创作。</p>
          </div>
          <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {MEMBERSHIP_PLANS.map((plan) => (
              <StaggerItem key={plan.id}>
                <GlassCard className={`relative p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-paper ${plan.maxScenes ? 'border-2 border-amber-300 bg-gradient-to-b from-amber-50 to-white' : ''}`}>
                  {plan.maxScenes && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-medium text-white">体验推荐</span>
                  )}
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="mt-2 text-3xl font-extrabold text-violet-700">¥{plan.price}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.maxScenes ? `一次购买 · 最多${plan.maxScenes}页` : `${plan.periodDays}天 · 约¥${plan.pricePerDay.toFixed(2)}/天`}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </StaggerItem>
            ))}
          </StaggerList>
        </section>
      </FadeIn>

      <FadeIn delay={0.08}>
        <section id="redeem" className="space-y-6">
          {(error || purchaseError) && (
            <div className="rounded-[24px] border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {purchaseError || error}
            </div>
          )}
          <GlassCard className="p-5 sm:p-8">
            <div className="mb-5 flex items-start gap-3">
              <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
                <TicketPercent className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-violet-700">兑换码</p>
                <h2 className="mt-2 text-2xl font-bold md:text-3xl">兑换积分、月卡、季卡或年卡</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">输入销售提供的兑换码，系统会自动发放对应积分或会员权益。</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={redeemCodeValue}
                onChange={(event) => setRedeemCodeValue(event.target.value.toUpperCase())}
                placeholder="输入兑换码，例如 VIP2026ABCD"
                className="h-11 rounded-full bg-white/80 px-4"
              />
              <Button onClick={handleRedeem} disabled={isPurchasing || !redeemCodeValue.trim()} className="h-11 rounded-full px-6">
                {isPurchasing ? '兑换中...' : '立即兑换'}
              </Button>
            </div>

            {lastRedeemResult && (
              <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
                {lastRedeemResult.rewardType === 'points'
                  ? `兑换成功，已到账 ${lastRedeemResult.pointsAmount || 0} 积分，当前积分 ${lastRedeemResult.userPoints}。`
                  : `兑换成功，已开通${lastRedeemResult.membershipTier === 'times' ? '次卡' : lastRedeemResult.membershipTier === 'monthly' ? '月卡' : lastRedeemResult.membershipTier === 'quarterly' ? '季卡' : lastRedeemResult.membershipTier === 'yearly' ? '年卡' : '周卡'}，当前剩余额度 ${lastRedeemResult.membership.remainingQuota}。`}
              </div>
            )}
          </GlassCard>

          <StaggerList className="grid gap-3 md:grid-cols-3">
            {[
              ['联系销售', '确认需要的会员档位或积分包。'],
              ['获取兑换码', '销售发放一人一码或活动批次码。'],
              ['输入兑换', '兑换后权益立即写入当前账号。'],
            ].map(([title, desc], index) => (
              <StaggerItem key={title}>
                <GlassCard className="p-5">
                  <p className="text-sm font-semibold text-amber-600">0{index + 1}</p>
                  <h3 className="mt-2 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
                </GlassCard>
              </StaggerItem>
            ))}
          </StaggerList>
        </section>
      </FadeIn>

      <StaggerList className="space-y-4">
        <StaggerItem>
          <div className="text-center">
            <p className="text-sm font-medium text-violet-700">常见问题</p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">开通前你可能想先确认这些</h2>
          </div>
        </StaggerItem>
        <div className="mx-auto grid max-w-4xl gap-4">
          {FAQS.map((faq) => (
            <StaggerItem key={faq.title}>
              <GlassCard className="p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper md:p-6">
                <h3 className="text-lg font-bold">{faq.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
              </GlassCard>
            </StaggerItem>
          ))}
        </div>
      </StaggerList>
    </div>
  );
}
