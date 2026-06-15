'use client';

import { Check, Crown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MembershipPlan, MembershipTier } from '@/types/membership';
import { Button } from './button';

interface MembershipCardProps {
  plan: MembershipPlan;
  isCurrentPlan?: boolean;
  onPurchase?: (planId: MembershipTier) => void;
  isLoading?: boolean;
}

export function MembershipCard({ plan, isCurrentPlan = false, onPurchase, isLoading = false }: MembershipCardProps) {
  const handlePurchase = () => {
    if (onPurchase && !isCurrentPlan) {
      onPurchase(plan.id);
    }
  };

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-[30px] border p-6 transition-all duration-200',
        plan.popular ? 'border-violet-300 bg-gradient-to-b from-violet-50 to-amber-50 shadow-magic lg:-translate-y-2' : 'border-white/70 bg-white/82 hover:-translate-y-1 hover:shadow-paper',
        isCurrentPlan && 'border-emerald-300 bg-emerald-50/70'
      )}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full bg-gradient-to-r from-violet-600 to-amber-400 px-4 py-1 text-xs font-medium text-white shadow-magic">
            <Crown className="mr-1 h-3.5 w-3.5" />
            最佳价值
          </span>
        </div>
      )}

      {isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-1 text-xs font-medium text-white">
            当前方案
          </span>
        </div>
      )}

      <div className="mb-4 text-center pt-2">
        <h3 className="text-2xl font-bold">{plan.name}</h3>
      </div>

      <div className="mb-6 text-center">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-extrabold text-violet-700">¥{plan.price}</span>
          <span className="text-sm text-muted-foreground">/{plan.name}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {plan.type === 'points'
            ? `${plan.pointsPerScene}积分/页 · 无限制`
            : plan.dailyStoryLimit
              ? `每天${plan.dailyStoryLimit}个故事 · 最多${plan.maxScenes}页`
              : plan.maxScenes
                ? `一次购买 · 最多${plan.maxScenes}页`
                : `约 ¥${plan.pricePerDay.toFixed(2)}/天`}
        </p>
      </div>

      <ul className="mb-6 flex-1 space-y-3">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-sm leading-6">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      <Button className={cn('w-full rounded-full', isCurrentPlan && 'opacity-60 cursor-not-allowed')} variant={plan.popular ? 'magic' : 'outline'} disabled={isCurrentPlan || isLoading} onClick={handlePurchase}>
        {isCurrentPlan ? '当前已开通' : isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> 处理中...</> : `购买${plan.name}`}
      </Button>
    </div>
  );
}
