'use client';

import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminPage() {
  const { stats } = useAdmin();
  return <AdminDashboard stats={stats} />;
}
