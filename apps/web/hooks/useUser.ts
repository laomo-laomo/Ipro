'use client';

import { useState, useCallback, useEffect } from 'react';
import type { User } from '@/types/auth';
import { getCurrentUser } from '@/lib/api/auth';

interface UseUserState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

interface UseUserActions {
  refreshUser: () => Promise<void>;
  clearUser: () => void;
}

export function useUser(): UseUserState & UseUserActions {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载用户信息
  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : '获取用户信息失败';
      setError(message);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 清除用户信息
  const clearUser = useCallback(() => {
    setUser(null);
    setError(null);
  }, []);

  return {
    // State
    user,
    isLoading,
    error,

    // Actions
    refreshUser,
    clearUser,
  };
}

// Hook to get user from auth context (for use within AuthProvider)
export function useUserFromAuth(auth: { user: User | null; isAuthenticated: boolean }) {
  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
  };
}