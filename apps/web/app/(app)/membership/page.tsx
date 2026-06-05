'use client';

import { useEffect } from 'react';
import { BookOpen, Clock, Crown, Sparkles, Video } from 'lucide-react';
import { useMembership } from '@/hooks/useMembership';
import { MembershipStatus } from '@/components/ui/membership-status';
import { PricingTable } from '@/components/ui/pricing-table';
import { MEMBERSHIP_BENEFITS } from '@/types/membership';
import { GlassCard, MagicButton } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';

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
    loadMembershipStatus,
    purchaseMembership,
  } = useMembership();

  useEffect(() => {
    loadMembershipStatus();
  }, [loadMembershipStatus]);

  const handlePurchase = async (planId: string, channel: 'wechat' | 'alipay' | 'stripe') => {
    const result = await purchaseMembership(planId as 'weekly' | 'monthly' | 'quarterly' | 'yearly', channel);

    if (result) {
      if (result.qrCode) {
        console.log('QR Code:', result.qrCode);
      }

      const redirectUrl = result.paymentUrl || result.checkoutUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    }
  };

  return (
    <div className="page-shell page-enter space-y-8">
      <FadeIn>
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-medium text-violet-700">
              <Crown className="h-4 w-4 text-amber-500" />
              成为童话魔法师
            </span>
            <div>
              <h1 className="text-4xl font-bold sm:text-5xl">把每一个普通夜晚，变成孩子期待的故事时刻。</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
                会员不仅是更多额度，更是完整解锁绘本下载、视频生成、声音魔法和更流畅的创作节奏。
              </p>
            </div>
            <MagicButton href="#plans" size="lg" className="px-8">
              升级会员，解锁全部魔法
            </MagicButton>
          </div>

          <GlassCard className="p-6 sm:p-8 transition-transform duration-300 hover:-translate-y-1 hover:shadow-paper">
            <p className="text-sm font-medium text-violet-700">当前状态</p>
            <div className="mt-4">
              <MembershipStatus status={membership} isLoading={isLoading} />
            </div>
            <div className="mt-6 rounded-[24px] bg-gradient-to-r from-violet-50 to-amber-50 p-5">
              <p className="text-sm text-muted-foreground">价值锚点</p>
              <p className="mt-2 text-3xl font-extrabold text-violet-700">年卡用户平均每个故事仅 ¥1.3</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">适合经常给孩子做睡前故事、节日纪念和成长记录的家庭。</p>
            </div>
          </GlassCard>
        </section>
      </FadeIn>

      <StaggerList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MEMBERSHIP_BENEFITS.map((benefit, index) => (
          <StaggerItem key={index}>
            <GlassCard className="p-6 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-paper">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-amber-50 text-violet-700">
                {iconMap[benefit.icon] || <Sparkles className="h-6 w-6" />}
              </div>
              <h2 className="text-lg font-bold">{benefit.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{benefit.description}</p>
            </GlassCard>
          </StaggerItem>
        ))}
      </StaggerList>

      <FadeIn delay={0.08}>
        <section id="plans" className="space-y-6">
          {(error || purchaseError) && (
            <div className="rounded-[24px] border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {purchaseError || error}
            </div>
          )}
          <GlassCard className="p-6 sm:p-8">
            <div className="mb-6 text-center">
              <p className="text-sm font-medium text-amber-600">选择套餐</p>
              <h2 className="mt-2 text-3xl font-bold">挑一个最适合你们家的魔法频率</h2>
            </div>
            <PricingTable currentTier={membership?.tier} onPurchase={handlePurchase} isPurchasing={isPurchasing} />
          </GlassCard>
        </section>
      </FadeIn>

      <StaggerList className="space-y-4">
        <StaggerItem>
          <div className="text-center">
            <p className="text-sm font-medium text-violet-700">常见问题</p>
            <h2 className="mt-2 text-3xl font-bold">开通前你可能想先确认这些</h2>
          </div>
        </StaggerItem>
        <div className="mx-auto grid max-w-4xl gap-4">
          {FAQS.map((faq) => (
            <StaggerItem key={faq.title}>
              <GlassCard className="p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper">
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
