'use client';

import { PricesEditor } from '@/components/admin/prices-editor';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminPricesPage() {
  const { membershipPlans, prices, saveMembershipPlans, savePrice } = useAdmin();
  return <PricesEditor membershipPlans={membershipPlans} prices={prices} onSave={savePrice} onSaveMembershipPlans={saveMembershipPlans} />;
}
