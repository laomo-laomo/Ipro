'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendPhoneCode, loginWithPhone } from '@/lib/api/auth';

interface PhoneRegisterFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function PhoneRegisterForm({ onSuccess, onError }: PhoneRegisterFormProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  const isValidPhone = (p: string): boolean => /^1[3-9]\d{9}$/.test(p);

  const handleSendCode = useCallback(async () => {
    if (!isValidPhone(phone)) {
      onError?.('请输入正确的手机号');
      return;
    }
    setIsSendingCode(true);
    try {
      await sendPhoneCode({ phone });
      setCodeSent(true);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setIsSendingCode(false);
    }
  }, [phone, onError]);

  const handleRegister = useCallback(async () => {
    if (!isValidPhone(phone)) { onError?.('请输入正确的手机号'); return; }
    if (code.length !== 6) { onError?.('请输入6位验证码'); return; }

    setIsRegistering(true);
    try {
      // Registration uses the same login endpoint (auto-creates user)
      const result = await loginWithPhone({ phone, code });
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', result.token);
      }
      onSuccess?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '注册失败');
    } finally {
      setIsRegistering(false);
    }
  }, [phone, code, onSuccess, onError]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="phone" className="text-sm font-medium text-white/85">手机号</label>
        <Input id="phone" type="tel" placeholder="请输入手机号" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={11} className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/40" />
      </div>
      <div className="space-y-2">
        <label htmlFor="code" className="text-sm font-medium text-white/85">验证码</label>
        <div className="flex gap-2">
          <Input id="code" type="text" placeholder="请输入验证码" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6} className="h-11 flex-1 border-white/20 bg-white/10 text-white placeholder:text-white/40" />
          <Button type="button" variant="outline" onClick={handleSendCode} disabled={isSendingCode || countdown > 0} className="h-11 min-w-[100px] border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            {countdown > 0 ? `${countdown}s` : isSendingCode ? '发送中...' : '获取验证码'}
          </Button>
        </div>
      </div>
      <Button type="button" variant="magic" onClick={handleRegister} disabled={isRegistering || !codeSent || code.length !== 6} className="h-11 w-full">
        {isRegistering ? <span className="flex items-center gap-2"><span className="animate-spin">⟳</span>注册中...</span> : '注册'}
      </Button>
    </div>
  );
}

export default PhoneRegisterForm;
