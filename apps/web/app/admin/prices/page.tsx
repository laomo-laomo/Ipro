'use client';

import { PricesEditor } from '@/components/admin/prices-editor';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminPricesPage() {
  const { prices, savePrice } = useAdmin();
  return <PricesEditor prices={prices} onSave={savePrice} />;
}
