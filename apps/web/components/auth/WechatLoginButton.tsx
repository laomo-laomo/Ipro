'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';
import { wechatLogin } from '@/lib/api/auth';

interface WechatLoginButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  size?: 'default' | 'lg';
}

export function WechatLoginButton({
  onSuccess,
  onError,
  size = 'lg',
}: WechatLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const finishLogin = async (code: string) => {
    const result = await wechatLogin({ code });
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', result.token);
    }
    onSuccess?.();
  };

  const handleWechatLogin = async () => {
    setIsLoading(true);

    try {
      if (typeof window !== 'undefined') {
        const isWechatBrowser = /MicroMessenger/i.test(navigator.userAgent);
        const params = new URLSearchParams(window.location.search);
        const oauthCode = params.get('code');

        if (oauthCode) {
          await finishLogin(oauthCode);
          return;
        }

        if (isWechatBrowser) {
          const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
          if (!appId) {
            await finishLogin(`mock_wechat_code_${Date.now()}`);
            return;
          }

          const redirectUri = encodeURIComponent(window.location.href.split('?')[0]);
          const state = encodeURIComponent(window.location.pathname.startsWith('/admin') ? 'admin' : 'app');
          const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
          window.location.href = url;
          return;
        } else {
          await finishLogin(`mock_scan_code_${Date.now()}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '微信登录失败';
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      size={size}
      variant="default"
      className="bg-[#07c160] hover:bg-[#06ad56] text-white"
      onClick={handleWechatLogin}
      disabled={isLoading}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="animate-spin">⟳</span>
          登录中...
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          微信一键登录
        </span>
      )}
    </Button>
  );
}

export default WechatLoginButton;
