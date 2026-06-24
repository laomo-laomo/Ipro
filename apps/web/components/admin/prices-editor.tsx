'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AdminMembershipPlan, AdminPriceMap } from '@/types/admin';
import { GlassCard } from '@/components/magic';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const priceLabels: Record<string, { label: string; description: string; unit: string }> = {
  image: { label: '插画单价', description: '每张插画的生成费用', unit: '元/张' },
  video: { label: '视频生成', description: '每段视频的生成费用，设为0表示免费', unit: '元/次' },
  voiceClone: { label: '声音克隆', description: '一次性克隆声音的费用', unit: '元/次' },
  clonedVoicePer1kChar: { label: '克隆声音按量', description: '使用克隆声音配音的费用', unit: '元/千字' },
  timesCard: { label: '次卡', description: '一次性购买，1个故事，最多20页', unit: '元' },
  times1Card: { label: '1次卡', description: '1次创作机会', unit: '元' },
  times10Card: { label: '10次卡', description: '10次创作机会', unit: '元' },
  times50Card: { label: '50次卡', description: '50次创作机会', unit: '元' },
  times100Card: { label: '100次卡', description: '100次创作机会', unit: '元' },
  weeklyCard: { label: '周卡', description: '7天会员，无限故事', unit: '元' },
  monthlyCard: { label: '月卡', description: '30天会员，无限故事', unit: '元' },
  quarterlyCard: { label: '季卡', description: '90天会员，无限故事', unit: '元' },
  yearlyCard: { label: '年卡', description: '365天会员，无限故事', unit: '元' },
};

// Keys that are internal system data and should NOT be shown to admins
const INTERNAL_KEY_PREFIXES = ['prompt_rewrite_', 'prompt_restriction_'];

function isInternalKey(key: string): boolean {
  return INTERNAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function makeFiveTimesPlan(sortOrder: number): AdminMembershipPlan {
  return {
    id: 'times5',
    name: '5次卡',
    type: 'card',
    section: 'payAsYouGo',
    originalPrice: 0,
    price: 49,
    periodDays: 3650,
    pricePerDay: 0,
    maxScenes: 20,
    features: ['5次创作机会', '每个故事最多20页', '生成故事绘本', '生成视频'],
    popular: false,
    enabled: true,
    sortOrder,
  };
}

function emptyPlan(sortOrder: number): AdminMembershipPlan {
  return {
    id: `times${sortOrder + 1}`,
    name: '新次卡',
    type: 'card',
    section: 'payAsYouGo',
    originalPrice: 0,
    price: 0,
    periodDays: 3650,
    pricePerDay: 0,
    maxScenes: 20,
    features: ['创作机会', '每个故事最多20页'],
    popular: false,
    enabled: true,
    sortOrder,
  };
}

type PricesEditorProps = {
  prices: AdminPriceMap | null;
  membershipPlans: AdminMembershipPlan[];
  onSave: (key: string, value: number) => Promise<void>;
  onSaveMembershipPlans: (plans: AdminMembershipPlan[]) => Promise<AdminMembershipPlan[]>;
};

export function PricesEditor({ membershipPlans, prices, onSave, onSaveMembershipPlans }: PricesEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<AdminMembershipPlan[]>([]);
  const [savingPlans, setSavingPlans] = useState(false);

  useEffect(() => {
    setPlanDrafts(membershipPlans.map((plan) => ({ ...plan, features: [...plan.features] })));
  }, [membershipPlans]);

  // Filter out internal system keys
  const entries = Object.entries(prices || {}).filter(([key]) => !isInternalKey(key));

  // Group entries by category
  const aiPrices = entries.filter(([key]) => ['image', 'video', 'voiceClone', 'clonedVoicePer1kChar'].includes(key));
  const timesPrices = entries.filter(([key]) => key.startsWith('times'));
  const memberPrices = entries.filter(([key]) => ['weeklyCard', 'monthlyCard', 'quarterlyCard', 'yearlyCard'].includes(key));
  const sortedPlanDrafts = useMemo(() => [...planDrafts].sort((a, b) => a.sortOrder - b.sortOrder), [planDrafts]);

  const updatePlan = (id: string, patch: Partial<AdminMembershipPlan>) => {
    setPlanDrafts((prev) => prev.map((plan) => (plan.id === id ? { ...plan, ...patch } : plan)));
  };

  const addPlan = (preset?: 'times5') => {
    const nextOrder = planDrafts.length ? Math.max(...planDrafts.map((plan) => plan.sortOrder)) + 1 : 0;
    const nextPlan = preset === 'times5' ? makeFiveTimesPlan(nextOrder) : emptyPlan(nextOrder);
    setPlanDrafts((prev) => [...prev.filter((plan) => plan.id !== nextPlan.id), nextPlan]);
  };

  const removePlan = (id: string) => {
    setPlanDrafts((prev) => prev.filter((plan) => plan.id !== id));
  };

  const resetPlanDrafts = () => {
    setPlanDrafts(membershipPlans.map((plan) => ({ ...plan, features: [...plan.features] })));
  };

  const applyPlanDrafts = async () => {
    setSavingPlans(true);
    try {
      const normalized = sortedPlanDrafts.map((plan, index) => ({
        ...plan,
        id: plan.id.trim(),
        name: plan.name.trim(),
        price: Number(plan.price),
        originalPrice: Number(plan.originalPrice || 0),
        periodDays: Number(plan.periodDays || 3650),
        pricePerDay: Number(plan.pricePerDay || 0),
        maxScenes: plan.maxScenes ? Number(plan.maxScenes) : undefined,
        dailyStoryLimit: plan.dailyStoryLimit ? Number(plan.dailyStoryLimit) : undefined,
        pointsPerYuan: plan.pointsPerYuan ? Number(plan.pointsPerYuan) : undefined,
        pointsPerScene: plan.pointsPerScene ? Number(plan.pointsPerScene) : undefined,
        features: plan.features.map((feature) => feature.trim()).filter(Boolean),
        sortOrder: index,
      }));
      await onSaveMembershipPlans(normalized);
    } finally {
      setSavingPlans(false);
    }
  };

  const renderGroup = (title: string, items: [string, number][]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-violet-700">{title}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([key, value]) => {
            const meta = priceLabels[key];
            const draft = drafts[key] ?? String(value);
            return (
              <div key={key} className="rounded-[18px] border border-white/70 bg-white/80 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{meta?.label || key}</p>
                  <span className="text-xs text-muted-foreground">{meta?.unit || ''}</span>
                </div>
                {meta?.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="h-9 rounded-lg bg-white/85 px-3 text-sm"
                  />
                  <Button
                    size="sm"
                    className="shrink-0 rounded-lg px-3"
                    disabled={savingKey === key || draft === String(value)}
                    onClick={async () => {
                      setSavingKey(key);
                      try {
                        await onSave(key, Number(draft));
                      } finally {
                        setSavingKey(null);
                      }
                    }}
                  >
                    {savingKey === key ? '...' : '保存'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <GlassCard className="p-5 md:p-6">
        <h2 className="text-xl font-bold">价格配置</h2>
        <p className="mt-1 text-sm text-muted-foreground">调整系统各项费用，修改后立即生效。</p>

        <div className="mt-6 space-y-6">
          {renderGroup('AI 生成费用', aiPrices)}
          {renderGroup('旧版次卡价格', timesPrices)}
          {renderGroup('旧版周期卡价格', memberPrices)}
        </div>
      </GlassCard>

      <GlassCard className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">会员开通规则</h2>
            <p className="mt-1 text-sm text-muted-foreground">应用后，小程序会员中心只展示启用的规则。</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => addPlan('times5')}>新增5次卡</Button>
            <Button type="button" variant="outline" onClick={() => addPlan()}>新增规则</Button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {sortedPlanDrafts.map((plan) => (
            <div key={plan.id} className="rounded-[18px] border border-white/70 bg-white/80 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${plan.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {plan.enabled ? '已启用' : '已停用'}
                  </span>
                  {plan.popular && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">推荐</span>}
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => updatePlan(plan.id, { enabled: !plan.enabled })}>
                    {plan.enabled ? '停用' : '启用'}
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => removePlan(plan.id)}>删除</Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-xs text-muted-foreground">
                  规则ID
                  <Input value={plan.id} onChange={(e) => updatePlan(plan.id, { id: e.target.value })} className="h-9 rounded-lg bg-white/85 px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  名称
                  <Input value={plan.name} onChange={(e) => updatePlan(plan.id, { name: e.target.value })} className="h-9 rounded-lg bg-white/85 px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  价格
                  <Input type="number" step="0.1" value={plan.price} onChange={(e) => updatePlan(plan.id, { price: Number(e.target.value) })} className="h-9 rounded-lg bg-white/85 px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  有效期(天)
                  <Input type="number" value={plan.periodDays} onChange={(e) => updatePlan(plan.id, { periodDays: Number(e.target.value) })} className="h-9 rounded-lg bg-white/85 px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  分组
                  <select value={plan.section} onChange={(e) => updatePlan(plan.id, { section: e.target.value as AdminMembershipPlan['section'] })} className="h-9 w-full rounded-lg border border-input bg-white/85 px-3 text-sm text-foreground">
                    <option value="subscription">体验 / 周期卡</option>
                    <option value="payAsYouGo">次卡 / 积分</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  类型
                  <select value={plan.type} onChange={(e) => updatePlan(plan.id, { type: e.target.value as AdminMembershipPlan['type'] })} className="h-9 w-full rounded-lg border border-input bg-white/85 px-3 text-sm text-foreground">
                    <option value="card">会员卡</option>
                    <option value="points">积分</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  每故事页数上限
                  <Input type="number" value={plan.maxScenes || ''} onChange={(e) => updatePlan(plan.id, { maxScenes: e.target.value ? Number(e.target.value) : undefined })} className="h-9 rounded-lg bg-white/85 px-3 text-sm text-foreground" />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  每日故事上限
                  <Input type="number" value={plan.dailyStoryLimit || ''} onChange={(e) => updatePlan(plan.id, { dailyStoryLimit: e.target.value ? Number(e.target.value) : undefined })} className="h-9 rounded-lg bg-white/85 px-3 text-sm text-foreground" />
                </label>
              </div>

              <label className="mt-3 block space-y-1 text-xs text-muted-foreground">
                权益文案（每行一条）
                <textarea
                  value={plan.features.join('\n')}
                  onChange={(e) => updatePlan(plan.id, { features: e.target.value.split('\n') })}
                  className="min-h-20 w-full rounded-lg border border-input bg-white/85 px-3 py-2 text-sm text-foreground outline-none"
                />
              </label>

              <label className="mt-3 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(plan.popular)} onChange={(e) => updatePlan(plan.id, { popular: e.target.checked })} />
                推荐套餐
              </label>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={resetPlanDrafts} disabled={savingPlans}>取消</Button>
          <Button type="button" onClick={applyPlanDrafts} disabled={savingPlans}>{savingPlans ? '应用中...' : '应用规则'}</Button>
        </div>
      </GlassCard>
    </div>
  );
}
