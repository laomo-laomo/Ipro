'use client';

import { useState, useCallback } from 'react';
import type {
  MembershipStatus,
  MembershipTier,
  OrderCreateResponse,
  RedeemResult,
} from '@/types/membership';
import {
  getMembershipStatus,
  createMembershipOrder,
  getOrderStatus,
  redeemMembershipCode,
} from '@/lib/api/membership';

export interface UseMembershipState {
  // Membership status
  membership: MembershipStatus | null;
  
  // Order state
  currentOrder: OrderCreateResponse | null;
  lastRedeemResult: RedeemResult | null;
  
  // Loading states
  isLoading: boolean;
  isPurchasing: boolean;
  
  // Error states
  error: string | null;
  purchaseError: string | null;
}

export interface UseMembershipActions {
  // Load membership status
  loadMembershipStatus: () => Promise<void>;
  
  // Purchase membership
  purchaseMembership: (
    planId: MembershipTier,
    channel: 'wechat' | 'alipay' | 'stripe'
  ) => Promise<OrderCreateResponse | null>;
  
  // Check order status (for polling after redirect)
  checkOrderStatus: (orderId: string) => Promise<{
    orderId: string;
    status: 'pending' | 'paid' | 'failed' | 'refunded';
  } | null>;

  redeemCode: (code: string) => Promise<RedeemResult | null>;
  
  // Reset
  reset: () => void;
  resetError: () => void;
}

export function useMembership(): UseMembershipState & UseMembershipActions {
  // Membership status
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  
  // Current order
  const [currentOrder, setCurrentOrder] = useState<OrderCreateResponse | null>(null);
  const [lastRedeemResult, setLastRedeemResult] = useState<RedeemResult | null>(null);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  
  // Error states
  const [error, setError] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Load membership status
  const loadMembershipStatus = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const status = await getMembershipStatus();
      setMembership(status);
    } catch (err) {
      // If user is not logged in, membership will be null
      const message = err instanceof Error ? err.message : '获取会员状态失败';
      // Don't show error for unauthenticated users
      if (!message.includes('Unauthorized') && !message.includes('未登录')) {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Purchase membership
  const purchaseMembership = useCallback(async (
    planId: MembershipTier,
    channel: 'wechat' | 'alipay' | 'stripe'
  ): Promise<OrderCreateResponse | null> => {
    setIsPurchasing(true);
    setPurchaseError(null);
    setError(null);

    try {
      const order = await createMembershipOrder(planId, channel);
      setCurrentOrder(order);
      return order;
    } catch (err) {
      const message = err instanceof Error ? err.message : '购买失败';
      setPurchaseError(message);
      setError(message);
      return null;
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  // Check order status
  const checkOrderStatus = useCallback(async (orderId: string): Promise<{
    orderId: string;
    status: 'pending' | 'paid' | 'failed' | 'refunded';
  } | null> => {
    try {
      return await getOrderStatus(orderId);
    } catch {
      return null;
    }
  }, []);

  const redeemCode = useCallback(async (code: string): Promise<RedeemResult | null> => {
    setIsPurchasing(true);
    setPurchaseError(null);
    setError(null);

    try {
      const result = await redeemMembershipCode(code);
      setLastRedeemResult(result);
      await loadMembershipStatus();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '兑换失败';
      setPurchaseError(message);
      setError(message);
      return null;
    } finally {
      setIsPurchasing(false);
    }
  }, [loadMembershipStatus]);

  // Reset all state
  const reset = useCallback(() => {
    setMembership(null);
    setCurrentOrder(null);
    setLastRedeemResult(null);
    setIsLoading(false);
    setIsPurchasing(false);
    setError(null);
    setPurchaseError(null);
  }, []);

  // Reset errors only
  const resetError = useCallback(() => {
    setError(null);
    setPurchaseError(null);
  }, []);

  return {
    // State
    membership,
    currentOrder,
    lastRedeemResult,
    isLoading,
    isPurchasing,
    error,
    purchaseError,
    
    // Actions
    loadMembershipStatus,
    purchaseMembership,
    checkOrderStatus,
    redeemCode,
    reset,
    resetError,
  };
}
