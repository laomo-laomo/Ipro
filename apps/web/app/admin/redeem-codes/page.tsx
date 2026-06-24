'use client';

import { RedeemCodeManager } from '@/components/admin/redeem-code-manager';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminRedeemCodesPage() {
  const { createCodes, lastCreatedCodes, membershipPlans, redeemCodes, disableCode, refreshRedeemCodes, redeemCodeFilters } = useAdmin();
  return (
    <RedeemCodeManager
      membershipPlans={membershipPlans}
      onCreate={createCodes}
      lastCreatedCodes={lastCreatedCodes}
      redeemCodes={redeemCodes}
      onDisable={disableCode}
      onSearch={refreshRedeemCodes}
      filters={redeemCodeFilters}
    />
  );
}
