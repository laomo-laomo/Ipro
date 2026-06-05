'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

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

  const handleWechatLogin = async () => {
    setIsLoading(true);

    try {
      // 唤起微信登录（Web 环境下模拟）
      // 实际应该调用微信 OAuth2 授权
      // 这里暂时使用模拟的方式
      if (typeof window !== 'undefined') {
        // 检测是否在微信内置浏览器中
        const isWechatBrowser = /MicroMessenger/i.test(navigator.userAgent);

        if (isWechatBrowser) {
          // 微信内置浏览器，直接唤起授权
          // 调用微信 JS-SDK 进行登录
          // 由于没有真实的微信 AppID，这里模拟成功
          const mockCode = `mock_wechat_code_${Date.now()}`;
          await simulateWechatLogin(mockCode);
        } else {
          // 非微信浏览器，显示扫码登录
          // 实际应该显示二维码
          // 这里模拟扫码成功
          const mockCode = `mock_scan_code_${Date.now()}`;
          await simulateWechatLogin(mockCode);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '微信登录失败';
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  // 模拟微信登录
  const simulateWechatLogin = async (code: string) => {
    // 实际应该调用 API
    // const result = await wechatLogin({ code });
    // 这里只是模拟成功回调
    onSuccess?.();
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