'use client';

import { useState } from 'react';
import { CreditCard, Crown } from 'lucide-react';
import { MEMBERSHIP_PLANS, type MembershipPlan, type MembershipTier } from '@/types/membership';
import { MembershipCard } from './membership-card';
import { Button } from './button';

interface PricingTableProps {
  plans?: MembershipPlan[];
  currentTier?: MembershipTier | null;
  onPurchase: (planId: MembershipTier, channel: 'wechat' | 'alipay' | 'stripe') => void;
  isPurchasing?: boolean;
}

export function PricingTable({ plans = MEMBERSHIP_PLANS, currentTier, onPurchase, isPurchasing = false }: PricingTableProps) {
  const [selectedPlan, setSelectedPlan] = useState<MembershipTier | null>(null);
  const [showChannelModal, setShowChannelModal] = useState(false);

  const handlePlanClick = (planId: MembershipTier) => {
    if (planId !== currentTier) {
      setSelectedPlan(planId);
      setShowChannelModal(true);
    }
  };

  const handleChannelSelect = (channel: 'wechat' | 'alipay' | 'stripe') => {
    if (selectedPlan) {
      onPurchase(selectedPlan, channel);
      setShowChannelModal(false);
      setSelectedPlan(null);
    }
  };

  const getSelectedPlanName = () => plans.find((plan) => plan.id === selectedPlan)?.name || '';

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <MembershipCard key={plan.id} plan={plan} isCurrentPlan={plan.id === currentTier} onPurchase={handlePlanClick} isLoading={isPurchasing && selectedPlan === plan.id} />
        ))}
      </div>

      {showChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/60 bg-[#fffaf3] p-6 shadow-[0_30px_80px_-30px_rgba(76,29,149,0.45)]">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-amber-400 text-white shadow-magic">
                <Crown className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-2xl font-bold">购买 {getSelectedPlanName()}</h3>
              <p className="mt-2 text-sm text-muted-foreground">选择一个适合你的支付方式，继续开启童话魔法。</p>
            </div>

            <div className="mt-6 space-y-3">
              <Button variant="outline" className="w-full justify-start gap-3 rounded-2xl bg-white/80" onClick={() => handleChannelSelect('wechat')}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">微</span>
                微信支付
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 rounded-2xl bg-white/80" onClick={() => handleChannelSelect('alipay')}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">支</span>
                支付宝
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 rounded-2xl bg-white/80" onClick={() => handleChannelSelect('stripe')}>
                <CreditCard className="h-5 w-5" />
                信用卡 / 其他
              </Button>
            </div>

            <Button
              variant="ghost"
              className="mt-4 w-full rounded-full"
              onClick={() => {
                setShowChannelModal(false);
                setSelectedPlan(null);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
