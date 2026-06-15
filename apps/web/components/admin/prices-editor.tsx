'use client';

import { useState } from 'react';
import type { AdminPriceMap } from '@/types/admin';
import { GlassCard } from '@/components/magic';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const priceLabels: Record<string, { label: string; description: string; unit: string }> = {
  image: { label: '插画单价', description: '每张插画的生成费用', unit: '元/张' },
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

export function PricesEditor({ prices, onSave }: { prices: AdminPriceMap | null; onSave: (key: string, value: number) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Filter out internal system keys
  const entries = Object.entries(prices || {}).filter(([key]) => !isInternalKey(key));

  // Group entries by category
  const aiPrices = entries.filter(([key]) => ['image', 'voiceClone', 'clonedVoicePer1kChar'].includes(key));
  const timesPrices = entries.filter(([key]) => key.startsWith('times'));
  const memberPrices = entries.filter(([key]) => ['weeklyCard', 'monthlyCard', 'quarterlyCard', 'yearlyCard'].includes(key));

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
    <GlassCard className="p-5 md:p-6">
      <h2 className="text-xl font-bold">价格配置</h2>
      <p className="mt-1 text-sm text-muted-foreground">调整系统各项费用，修改后立即生效。</p>

      <div className="mt-6 space-y-6">
        {renderGroup('AI 生成费用', aiPrices)}
        {renderGroup('次卡套餐', timesPrices)}
        {renderGroup('周期会员卡', memberPrices)}
      </div>
    </GlassCard>
  );
}
