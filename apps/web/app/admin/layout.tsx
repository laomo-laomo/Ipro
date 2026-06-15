'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/components/ui/toast';
import { AdminShell } from '@/components/admin/admin-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <AdminShell>{children}</AdminShell>
      </ToastProvider>
    </AuthProvider>
  );
}
