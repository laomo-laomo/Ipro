'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Sparkles, Stars } from 'lucide-react';
import { FloatingParticles, GlassCard } from '@/components/magic';
import { WechatLoginButton } from '@/components/auth/WechatLoginButton';
import { PhoneLoginForm } from '@/components/auth/PhoneLoginForm';

function LoginContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const redirect = searchParams?.get('redirect') || '/';

  const handleLoginSuccess = () => {
    window.location.replace(redirect);
  };

  const handleError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 3000);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-violet-700 via-fuchsia-500 to-amber-400 px-4 py-8 md:py-10">
      <FloatingParticles count={12} />
      <div className="relative z-10 w-full max-w-md space-y-5 md:space-y-8">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/20 shadow-paper backdrop-blur-xl md:mb-5 md:h-20 md:w-20 md:rounded-[28px]">
            <BookOpen className="h-8 w-8 md:h-10 md:w-10" />
          </div>
          <p className="storybook-title text-3xl">IPro</p>
          <h1 className="mt-3 text-2xl font-bold md:text-3xl">打开你的童话故事</h1>
          <p className="mt-2 text-sm text-white/80">从一张照片开始，把普通夜晚变成值得反复回味的睡前绘本。</p>
        </div>

        <GlassCard className="border-white/25 bg-white/20 p-5 text-white backdrop-blur-2xl md:p-8">
          {error && (
            <div className="mb-4 rounded-2xl border border-white/20 bg-white/15 p-3 text-sm text-white">
              {error}
            </div>
          )}

          <div className="mb-5 rounded-[20px] border border-white/20 bg-white/10 p-4 text-sm text-white/85">
            <p className="font-semibold text-white">联调测试账号</p>
            <p className="mt-2 leading-7">手机号：13800138000</p>
            <p className="leading-7">验证码：123456</p>
            <p className="mt-2 text-xs text-white/70">如果只是要跑通前端创作流程，直接用这组测试账号即可。</p>
          </div>

          <div className="space-y-6">
            <WechatLoginButton size="lg" onSuccess={handleLoginSuccess} onError={handleError} />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/25" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-[0.2em]">
                <span className="bg-transparent px-3 text-white/70">或</span>
              </div>
            </div>

            <PhoneLoginForm onSuccess={handleLoginSuccess} onError={handleError} />
          </div>

          <div className="mt-6 text-center text-sm text-white/80">
            还没有账号？
            <Link href="/register" className="ml-1 font-medium text-white underline-offset-4 hover:underline">
              立即注册
            </Link>
          </div>
        </GlassCard>

        <div className="grid gap-2 text-center text-xs text-white/75 sm:flex sm:items-center sm:justify-center sm:gap-4">
          <span className="inline-flex items-center gap-1"><Stars className="h-3.5 w-3.5" /> 一键开启童话模式</span>
          <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> 微信和手机号双入口</span>
        </div>

        <p className="text-center text-xs text-white/65">
          登录即表示同意
          <a href="#" className="mx-1 text-white hover:underline">服务条款</a>
          和
          <a href="#" className="mx-1 text-white hover:underline">隐私政策</a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-700 via-fuchsia-500 to-amber-400 text-white">正在加载登录页...</div>}>
      <LoginContent />
    </Suspense>
  );
}
