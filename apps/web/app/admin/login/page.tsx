'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/magic';
import { AdminLoginForm } from '@/components/auth/AdminLoginForm';

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams?.get('redirect') || '/admin';

  const handleSuccess = () => {
    window.location.replace(redirect);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-900 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/12 shadow-paper backdrop-blur-xl">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold">IPro Admin</h1>
          <p className="mt-2 text-sm text-white/75">管理员后台登录入口</p>
        </div>

        <GlassCard className="border-white/20 bg-white/14 p-6 text-white backdrop-blur-2xl md:p-8">
          <AdminLoginForm onSuccess={handleSuccess} />
        </GlassCard>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-900 text-white">正在加载管理员登录页...</div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
