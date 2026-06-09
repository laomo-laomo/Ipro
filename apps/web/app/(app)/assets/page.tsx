'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { GlassCard, MagicButton } from '@/components/magic';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion';
import { authHeaders, API_BASE, resolveAssetUrl } from '@/lib/api/client';
import { ArrowRight, Camera, Image as ImageIcon, Loader2, Mic, Sparkles } from 'lucide-react';

interface Asset {
  id: string;
  type: 'photo' | 'stylized' | 'voice' | 'illustration';
  name: string;
  thumbnailUrl: string | null;
  createdAt: string;
  meta: Record<string, any>;
}

const TABS = [
  { key: 'all', label: '全部', icon: ImageIcon },
  { key: 'photo', label: '照片', icon: Camera },
  { key: 'stylized', label: '角色', icon: Sparkles },
  { key: 'illustration', label: '插画', icon: ImageIcon },
  { key: 'voice', label: '音效', icon: Mic },
] as const;

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/assets`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setAssets(data.data);
    } catch (_) {
      // Keep the page resilient even if the request fails.
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const filtered = activeTab === 'all' ? assets : assets.filter((asset) => asset.type === activeTab);
  const count = (type: string) => (type === 'all' ? assets.length : assets.filter((asset) => asset.type === type).length);

  const handleUse = () => {
    if (!selected) return;
    const asset = assets.find((item) => item.id === selected);
    if (!asset) return;

    if (asset.type === 'photo' || asset.type === 'stylized') {
      router.push(`/create/stylize?characterId=${asset.meta.characterId}`);
    }
    if (asset.type === 'illustration') {
      router.push(`/create/generate?storyId=${asset.meta.storyId}`);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!loading && assets.length === 0) {
    return (
      <div className="page-shell page-enter">
        <FadeIn>
          <GlassCard className="flex flex-col items-center justify-center px-5 py-16 text-center md:py-24">
            <Sparkles className="h-14 w-14 text-violet-300 md:h-16 md:w-16" />
            <h2 className="mt-5 text-2xl font-bold md:mt-6">素材库还在等第一件收藏</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">上传照片、生成角色和插画后，这里会慢慢长成你自己的童话资产库。</p>
            <MagicButton href="/create/upload" size="lg" className="mt-6 px-8">
              开始创作
            </MagicButton>
          </GlassCard>
        </FadeIn>
      </div>
    );
  }

  return (
    <div className="page-shell page-enter space-y-5 md:space-y-6">
      <FadeIn>
        <section>
          <p className="text-sm font-medium text-violet-700">素材库</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">把照片、角色、插画和声音都收进同一个故事抽屉</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:mt-3 md:text-base md:leading-8">这里会保存你创作过程中的重要资产，方便后续继续生成、复用和延展。</p>
        </section>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSelected(null);
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-all duration-200 ${activeTab === tab.key ? 'bg-violet-600 text-white shadow-magic' : 'bg-white/80 text-muted-foreground hover:-translate-y-0.5 hover:text-foreground'}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              <span className="text-xs opacity-75">{count(tab.key)}</span>
            </button>
          ))}
        </div>
      </FadeIn>

      <StaggerList className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {filtered.map((asset) => {
          const imageUrl = resolveAssetUrl(asset.thumbnailUrl || '') || asset.thumbnailUrl;
          const isSelected = selected === asset.id;

          return (
            <StaggerItem key={asset.id}>
              <button
                onClick={() => setSelected(isSelected ? null : asset.id)}
                className={`group overflow-hidden rounded-[22px] border p-1.5 text-left transition-all duration-200 md:rounded-[28px] md:p-2 ${isSelected ? 'border-violet-400 bg-violet-50/80 shadow-magic scale-[1.01]' : 'border-white/70 bg-white/80 hover:-translate-y-1 hover:shadow-paper'}`}
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-gradient-to-br from-violet-100 to-amber-50 md:rounded-[22px]">
                  {imageUrl ? (
                    <Image src={imageUrl} alt={asset.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes="(min-width:1024px) 25vw, 50vw" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-violet-400">
                      <Mic className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="p-2.5 md:p-3">
                  <p className="text-sm font-semibold line-clamp-1">{asset.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(asset.createdAt).toLocaleDateString('zh-CN')}</p>
                </div>
              </button>
            </StaggerItem>
          );
        })}
      </StaggerList>

      {selected && (
        <FadeIn>
          <div className="sticky bottom-[5.6rem] z-30 md:bottom-4">
            <GlassCard className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">已选择 1 项素材</p>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <Button variant="outline" size="sm" onClick={() => setSelected(null)} className="rounded-full">取消</Button>
                <Button size="sm" onClick={handleUse} className="rounded-full" variant="magic">
                  使用选中素材
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </GlassCard>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
