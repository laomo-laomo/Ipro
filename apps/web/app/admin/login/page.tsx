'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { AdminLoginForm } from '@/components/auth/AdminLoginForm';

function AdminLoginContent() {
  const searchParams = useSearchParams();
  const redirect = searchParams?.get('redirect') || '/admin';

  const handleSuccess = () => {
    window.location.replace(redirect);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-violet-900 to-fuchsia-800 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/20 shadow-lg backdrop-blur-sm">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">IPro Admin</h1>
          <p className="mt-2 text-sm text-white/90">管理员后台登录入口</p>
        </div>

        <div className="rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <AdminLoginForm onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-violet-900 to-fuchsia-800 text-white">正在加载管理员登录页...</div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
