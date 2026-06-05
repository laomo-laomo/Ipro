'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { User, AuthResponse } from '@/types/auth';
import {
  wechatLogin,
  sendPhoneCode,
  loginWithPhone,
  getCurrentUser,
  logout as apiLogout,
} from '@/lib/api/auth';

interface UseAuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface UseAuthActions {
  loginWithPhone: (phone: string, code: string) => Promise<boolean>;
  loginWithWechat: (code: string) => Promise<boolean>;
  sendCode: (phone: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthState & UseAuthActions {
  const router = useRouter();

  // State
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Computed
  const isAuthenticated = !!user;

  // 验证 token 并加载用户信息
  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 手机号登录
  const loginWithPhoneAction = useCallback(async (phone: string, code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await loginWithPhone({ phone, code });
      setUser(result.user);

      // 存储 token
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', result.token);
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 微信登录
  const loginWithWechatAction = useCallback(async (code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await wechatLogin({ code });
      setUser(result.user);

      // 存储 token
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', result.token);
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '微信登录失败';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 发送验证码
  const sendCodeAction = useCallback(async (phone: string): Promise<boolean> => {
    setError(null);

    try {
      await sendPhoneCode({ phone });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送验证码失败';
      setError(message);
      return false;
    }
  }, []);

  // 退出登录
  const logoutAction = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore errors
    }

    // 清除本地状态
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }

    // 跳转到登录页
    router.push('/login');
  }, [router]);

  // 清除错误
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 初始化时检查认证状态
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return {
    // State
    user,
    isAuthenticated,
    isLoading,
    error,

    // Actions
    loginWithPhone: loginWithPhoneAction,
    loginWithWechat: loginWithWechatAction,
    sendCode: sendCodeAction,
    logout: logoutAction,
    checkAuth,
    clearError,
  };
}

// Auth context for global state management
export type AuthContextValue = UseAuthState & UseAuthActions;

export const AUTH_TOKEN_KEY = 'auth_token';