import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { AdminShell } from '@/components/admin/admin-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <AdminShell>{children}</AdminShell>
    </AppShell>
  );
}
