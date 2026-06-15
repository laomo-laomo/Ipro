'use client';

import { useState } from 'react';
import { Shield, TestTube, ExternalLink } from 'lucide-react';
import { PhoneLoginForm } from './PhoneLoginForm';
import { WechatLoginButton } from './WechatLoginButton';
import { useAuthContext } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { API_BASE, jsonHeaders } from '@/lib/api/client';

export function AdminLoginForm({ onSuccess, onError }: { onSuccess?: () => void; onError?: (message: string) => void }) {
  const { user, isAdmin, logout } = useAuthContext();
  const [adminError, setAdminError] = useState<string | null>(null);
  const [loginMethod, setLoginMethod] = useState<'wechat' | 'phone'>('wechat');
  const [isTesting, setIsTesting] = useState(false);

  const handleSuccess = () => {
    if (user?.role === 'admin' || isAdmin) {
      onSuccess?.();
      return;
    }

    const message = '当前账号已登录，但不是管理员账号';
    setAdminError(message);
    onError?.(message);
    void logout();
  };

  // 测试登录：直接获取 dev 用户 token
  const handleTestLogin = async () => {
    setIsTesting(true);
    setAdminError(null);
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        method: 'GET',
        headers: jsonHeaders(),
      });
      const result = await response.json();
      if (result.success && result.data) {
        handleSuccess();
      } else {
        setAdminError('测试登录失败');
      }
    } catch (err) {
      setAdminError('测试登录失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm">
        <div className="flex items-center gap-2 text-amber-800">
          <Shield className="h-4 w-4" />
          <span className="font-semibold">管理员登录</span>
        </div>
        <p className="mt-2 leading-7 text-amber-700">请使用已授权的管理员账号登录。支持微信扫码或手机号验证码。</p>
      </div>

      {adminError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {adminError}
        </div>
      )}

      {/* 开发环境测试登录 */}
      {process.env.NODE_ENV === 'development' && (
        <Button
          type="button"
          variant="outline"
          onClick={handleTestLogin}
          disabled={isTesting}
          className="w-full border-dashed border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
        >
          <TestTube className="mr-2 h-4 w-4" />
          {isTesting ? '登录中...' : '开发环境：一键登录管理员'}
        </Button>
      )}

      {/* 登录方式切换 */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={loginMethod === 'wechat' ? 'default' : 'outline'}
          onClick={() => { setLoginMethod('wechat'); setAdminError(null); }}
          className={`flex-1 ${loginMethod === 'wechat' ? 'bg-[#07c160] hover:bg-[#06ad56] text-white' : ''}`}
        >
          微信登录
        </Button>
        <Button
          type="button"
          variant={loginMethod === 'phone' ? 'default' : 'outline'}
          onClick={() => { setLoginMethod('phone'); setAdminError(null); }}
          className={`flex-1 ${loginMethod === 'phone' ? 'bg-violet-600 hover:bg-violet-700 text-white' : ''}`}
        >
          手机号登录
        </Button>
      </div>

      {loginMethod === 'wechat' ? (
        <div className="space-y-3">
          <WechatLoginButton onSuccess={handleSuccess} onError={onError} size="lg" />
          <p className="text-center text-xs text-gray-500">
            在微信小程序中调用 wx.login() 获取 code 后自动登录
          </p>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <p className="font-semibold mb-1">测试步骤：</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>在微信开发者工具中打开小程序</li>
              <li>调用 wx.login() 获取 code</li>
              <li>将 code 发送到 /api/auth/wechat-login</li>
            </ol>
          </div>
        </div>
      ) : (
        <PhoneLoginForm onSuccess={handleSuccess} onError={onError} hideTestShortcut />
      )}

      <p className="text-center text-xs text-gray-400">仅允许管理员账号进入后台</p>
    </div>
  );
}
