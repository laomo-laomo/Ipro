'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { NavBar } from '@/components/ui/nav-bar';
import { ToastProvider } from '@/components/ui/toast';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <NavBar />
        <main className="pt-0">{children}</main>
      </ToastProvider>
    </AuthProvider>
  );
}
