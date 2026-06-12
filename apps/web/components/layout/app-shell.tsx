'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { NavBar } from '@/components/ui/nav-bar';
import { ToastProvider } from '@/components/ui/toast';
import { HydrationSafeRoot } from '@/components/hydration-safe-root';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <HydrationSafeRoot>
      <AuthProvider>
        <ToastProvider>
          <NavBar />
          <main className="pt-0" suppressHydrationWarning>{children}</main>
        </ToastProvider>
      </AuthProvider>
    </HydrationSafeRoot>
  );
}
