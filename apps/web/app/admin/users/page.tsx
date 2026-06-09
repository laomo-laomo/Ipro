'use client';

import { UsersTable } from '@/components/admin/users-table';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminUsersPage() {
  const { users } = useAdmin();
  return <UsersTable users={users} />;
}
