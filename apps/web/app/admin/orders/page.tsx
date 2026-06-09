'use client';

import { OrdersTable } from '@/components/admin/orders-table';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminOrdersPage() {
  const { orders, refreshOrders } = useAdmin();
  return <OrdersTable orders={orders} onFilter={refreshOrders} />;
}
