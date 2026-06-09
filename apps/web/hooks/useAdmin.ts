'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminOrderList, AdminPriceMap, AdminRedeemCodeCreateResult, AdminRedeemCodeFilters, AdminRedeemCodeList, AdminStats, AdminUserList } from '@/types/admin';
import { createAdminRedeemCodes, disableAdminRedeemCode, getAdminOrders, getAdminPrices, getAdminRedeemCodes, getAdminStats, getAdminUsers, updateAdminPrice } from '@/lib/api/admin';

export function useAdmin() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<AdminOrderList | null>(null);
  const [users, setUsers] = useState<AdminUserList | null>(null);
  const [prices, setPrices] = useState<AdminPriceMap | null>(null);
  const [lastCreatedCodes, setLastCreatedCodes] = useState<AdminRedeemCodeCreateResult | null>(null);
  const [redeemCodes, setRedeemCodes] = useState<AdminRedeemCodeList | null>(null);
  const [redeemCodeFilters, setRedeemCodeFilters] = useState<AdminRedeemCodeFilters>({ limit: 50, offset: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statsResult, ordersResult, usersResult, pricesResult, redeemCodesResult] = await Promise.all([
        getAdminStats(),
        getAdminOrders({ limit: 20, offset: 0 }),
        getAdminUsers({ limit: 20, offset: 0 }),
        getAdminPrices(),
        getAdminRedeemCodes({ limit: 50, offset: 0 }),
      ]);
      setStats(statsResult);
      setOrders(ordersResult);
      setUsers(usersResult);
      setPrices(pricesResult);
      setRedeemCodes(redeemCodesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载管理员数据失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshRedeemCodes = useCallback(async (params?: AdminRedeemCodeFilters) => {
    const nextFilters = {
      ...redeemCodeFilters,
      ...params,
    };
    const result = await getAdminRedeemCodes(nextFilters);
    setRedeemCodes(result);
    setRedeemCodeFilters(nextFilters);
  }, [redeemCodeFilters]);

  const refreshOrders = useCallback(async (status?: string) => {
    const result = await getAdminOrders({ status, limit: 20, offset: 0 });
    setOrders(result);
  }, []);

  const refreshUsers = useCallback(async () => {
    const result = await getAdminUsers({ limit: 20, offset: 0 });
    setUsers(result);
  }, []);

  const refreshPrices = useCallback(async () => {
    const result = await getAdminPrices();
    setPrices(result);
  }, []);

  const savePrice = useCallback(async (key: string, value: number) => {
    await updateAdminPrice(key, value);
    await refreshPrices();
  }, [refreshPrices]);

  const createCodes = useCallback(async (body: {
    rewardType: 'points' | 'membership';
    count: number;
    pointsAmount?: number;
    membershipTier?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    expiresAt?: string;
    note?: string;
  }) => {
    const result = await createAdminRedeemCodes(body);
    setLastCreatedCodes(result);
    await refreshRedeemCodes();
    return result;
  }, [refreshRedeemCodes]);

  const disableCode = useCallback(async (id: string) => {
    await disableAdminRedeemCode(id);
    await refreshRedeemCodes();
  }, [refreshRedeemCodes]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return {
    stats,
    orders,
    users,
    prices,
    lastCreatedCodes,
    redeemCodes,
    redeemCodeFilters,
    isLoading,
    error,
    loadDashboard,
    refreshOrders,
    refreshUsers,
    refreshPrices,
    refreshRedeemCodes,
    savePrice,
    createCodes,
    disableCode,
  };
}
