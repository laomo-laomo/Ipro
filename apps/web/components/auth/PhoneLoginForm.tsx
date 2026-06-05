'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthContext } from '@/providers/AuthProvider';

interface PhoneLoginFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function PhoneLoginForm({ onSuccess, onError }: PhoneLoginFormProps) {
  const { sendCode, loginWithPhone } = useAuthContext();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  const isValidPhone = (value: string): boolean => /^1[3-9]\d{9}$/.test(value);

  const fillTestAccount = useCallback(() => {
    setPhone('13800138000');
    setCode('123456');
    setCodeSent(true);
    setCountdown(0);
  }, []);

  const handleSendCode = useCallback(async () => {
    if (!isValidPhone(phone)) {
      onError?.('请输入正确的手机号');
      return;
    }

    if (phone === '13800138000') {
      setCodeSent(true);
      setCode('123456');
      onError?.('测试账号无需发送验证码，已自动填入 123456');
      return;
    }

    setIsSendingCode(true);
    try {
      const sent = await sendCode(phone);
      if (!sent) {
        onError?.('发送验证码失败');
        return;
      }
      setCodeSent(true);
      setCountdown(60);

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送验证码失败';
      onError?.(message);
    } finally {
      setIsSendingCode(false);
    }
  }, [phone, onError, sendCode]);

  const handleLogin = useCallback(async () => {
    if (!isValidPhone(phone)) {
      onError?.('请输入正确的手机号');
      return;
    }

    if (code.length !== 6) {
      onError?.('请输入6位验证码');
      return;
    }

    setIsLoggingIn(true);
    try {
      const loggedIn = await loginWithPhone(phone, code);
      if (loggedIn) {
        onSuccess?.();
      } else {
        onError?.('登录失败，请检查验证码');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      onError?.(message);
    } finally {
      setIsLoggingIn(false);
    }
  }, [phone, code, onSuccess, onError, loginWithPhone]);

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" onClick={fillTestAccount} className="w-full border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
        一键填入测试账号
      </Button>

      <div className="space-y-2">
        <label htmlFor="phone" className="text-sm font-medium text-white/85">
          手机号
        </label>
        <Input
          id="phone"
          type="tel"
          placeholder="请输入手机号"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={11}
          className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/40"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="code" className="text-sm font-medium text-white/85">
          验证码
        </label>
        <div className="flex gap-2">
          <Input
            id="code"
            type="text"
            placeholder="请输入验证码"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
            className="h-11 flex-1 border-white/20 bg-white/10 text-white placeholder:text-white/40"
          />
          <Button type="button" variant="outline" onClick={handleSendCode} disabled={isSendingCode || countdown > 0} className="h-11 min-w-[112px] border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            {countdown > 0 ? `${countdown}s` : isSendingCode ? '发送中...' : '获取验证码'}
          </Button>
        </div>
      </div>

      <Button type="button" variant="magic" onClick={handleLogin} disabled={isLoggingIn || !codeSent || code.length !== 6} className="w-full h-11">
        {isLoggingIn ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">⟳</span>
            登录中...
          </span>
        ) : (
          '登录'
        )}
      </Button>
    </div>
  );
}

export default PhoneLoginForm;
