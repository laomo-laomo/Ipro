'use client';

import { useState } from 'react';
import type { AdminPriceMap } from '@/types/admin';
import { GlassCard } from '@/components/magic';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PricesEditor({ prices, onSave }: { prices: AdminPriceMap | null; onSave: (key: string, value: number) => Promise<void> }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const entries = Object.entries(prices || {});

  return (
    <GlassCard className="p-5 md:p-6">
      <h2 className="text-xl font-bold">价格配置</h2>
      <p className="mt-1 text-sm text-muted-foreground">直接维护当前系统价格配置。</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map(([key, value]) => {
          const draft = drafts[key] ?? String(value);
          return (
            <div key={key} className="rounded-[22px] border border-white/70 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-semibold tracking-[0.16em] text-violet-700 uppercase">{key}</p>
              <Input value={draft} onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))} className="mt-3 h-11 rounded-full bg-white/85 px-4" />
              <Button
                className="mt-3 w-full rounded-full"
                disabled={savingKey === key}
                onClick={async () => {
                  setSavingKey(key);
                  try {
                    await onSave(key, Number(draft));
                  } finally {
                    setSavingKey(null);
                  }
                }}
              >
                {savingKey === key ? '保存中...' : '保存'}
              </Button>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
