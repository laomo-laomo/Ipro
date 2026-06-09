'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';
import { PhoneLoginForm } from './PhoneLoginForm';
import { useAuthContext } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';

export function AdminLoginForm({ onSuccess, onError }: { onSuccess?: () => void; onError?: (message: string) => void }) {
  const { user, isAdmin, logout } = useAuthContext();
  const [adminError, setAdminError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-amber-200/60 bg-amber-50/10 p-4 text-sm text-white/85">
        <div className="flex items-center gap-2 text-white">
          <Shield className="h-4 w-4" />
          <span className="font-semibold">管理员登录</span>
        </div>
        <p className="mt-2 leading-7 text-white/75">请使用已经在数据库中设置为 `admin` 角色的账号登录。登录成功后会自动校验权限。</p>
      </div>

      {adminError && (
        <div className="rounded-2xl border border-rose-200/40 bg-rose-500/10 p-3 text-sm text-white">
          {adminError}
        </div>
      )}

      <PhoneLoginForm onSuccess={handleSuccess} onError={onError} hideTestShortcut />

      <Button type="button" variant="outline" onClick={() => { setAdminError(null); onError?.(''); }} className="w-full border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
        仅允许管理员账号进入后台
      </Button>
    </div>
  );
}
