'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { User } from '@/types/auth';
import { useAuth } from '@/hooks/useAuth';

// Auth context
interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isAdmin: boolean;
  loginWithPhone: (phone: string, code: string) => Promise<boolean>;
  loginWithWechat: (code: string) => Promise<boolean>;
  sendCode: (phone: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}

// Auth provider
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}
