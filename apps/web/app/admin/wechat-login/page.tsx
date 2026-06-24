'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MessageCircle, Loader2 } from 'lucide-react';
import { wechatLogin } from '@/lib/api/auth';

function WechatLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleWechatLogin = async () => {
      const code = searchParams?.get('code');
      const state = searchParams?.get('state');

      if (code) {
        try {
          setStatus('loading');
          await wechatLogin({ code });
          const redirect = state === 'admin' ? '/admin' : '/';
          router.replace(redirect);
        } catch (err) {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : '登录失败');
        }
      } else {
        const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
        if (!appId) {
          setStatus('error');
          setErrorMsg('未配置微信 AppID');
          return;
        }

        const currentUrl = window.location.href.split('?')[0];
        const redirectUri = encodeURIComponent(currentUrl);
        const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=admin#wechat_redirect`;
        
        window.location.href = url;
      }
    };

    handleWechatLogin();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-violet-900 to-fuchsia-800">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/20 shadow-lg backdrop-blur-sm">
            <MessageCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">微信登录</h1>
          <p className="mt-2 text-sm text-white/90">正在跳转微信授权...</p>
        </div>

        <div className="rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl backdrop-blur-xl md:p-8">
          {status === 'loading' && (
            <div className="flex flex-col items-center space-y-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-violet-600" />
              <p className="text-sm text-gray-600">
                {searchParams?.get('code') ? '正在验证微信身份...' : '正在跳转微信授权页面...'}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 py-8 text-center">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMsg}
              </div>
              <button
                onClick={() => router.replace('/admin/login')}
                className="rounded-full bg-violet-600 px-6 py-2 text-sm font-medium text-white hover:bg-violet-700"
              >
                返回登录页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WechatLoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-violet-900 to-fuchsia-800">
        <Loader2 className="h-12 w-12 animate-spin text-white" />
      </div>
    }>
      <WechatLoginContent />
    </Suspense>
  );
}
