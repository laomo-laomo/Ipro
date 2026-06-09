'use client';

import { RedeemCodeManager } from '@/components/admin/redeem-code-manager';
import { useAdmin } from '@/hooks/useAdmin';

export default function AdminRedeemCodesPage() {
  const { createCodes, lastCreatedCodes, redeemCodes, disableCode, refreshRedeemCodes, redeemCodeFilters } = useAdmin();
  return (
    <RedeemCodeManager
      onCreate={createCodes}
      lastCreatedCodes={lastCreatedCodes}
      redeemCodes={redeemCodes}
      onDisable={disableCode}
      onSearch={refreshRedeemCodes}
      filters={redeemCodeFilters}
    />
  );
}
