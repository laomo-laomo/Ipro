import type {
  MembershipStatus,
  MembershipPlan,
  OrderCreateResponse,
  RedeemResult,
  ApiResponse,
  MembershipTier,
} from '@/types/membership';
import { API_BASE, jsonHeaders } from './client';

/**
 * Get user's membership status
 * Note: This endpoint needs to be implemented in backend
 */
export async function getMembershipStatus(): Promise<MembershipStatus> {
  try {
    const response = await fetch(`${API_BASE}/api/membership/status`, {
      method: 'GET',
      headers: jsonHeaders(),
    });

    const result: ApiResponse<MembershipStatus> = await response.json();
    if (!result.success) {
      throw new Error(result.message || '获取会员状态失败');
    }
    return result.data || {
      isActive: false,
      tier: null,
      expiresAt: null,
      remainingQuota: 0,
      totalQuota: 0,
      maxScenes: null,
      dailyStoryLimit: null,
      todayStoryCount: 0,
      userPoints: 0,
    };
  } catch {
    // Return default status if not logged in or error
    return {
      isActive: false,
      tier: null,
      expiresAt: null,
      remainingQuota: 0,
      totalQuota: 0,
      maxScenes: null,
      dailyStoryLimit: null,
      todayStoryCount: 0,
      userPoints: 0,
    };
  }
}

/**
 * Get available membership plans
 * Note: This endpoint needs to be implemented in backend
 */
export async function getMembershipPlans(): Promise<MembershipPlan[]> {
  try {
    const response = await fetch(`${API_BASE}/api/membership/plans`, {
      method: 'GET',
      headers: jsonHeaders(),
    });

    const result: ApiResponse<MembershipPlan[]> = await response.json();
    if (!result.success) {
      throw new Error(result.message || '获取套餐失败');
    }
    return result.data || [];
  } catch {
    // Return empty array if error
    return [];
  }
}

/**
 * Create order for membership.
 * Backend already exposes a membership-specific purchase route that returns the
 * payment URL; calling the generic orders endpoint here caused the current UI
 * to drift from the actual API contract.
 */
export async function createMembershipOrder(
  planId: MembershipTier,
  channel: 'wechat' | 'alipay' | 'stripe'
): Promise<OrderCreateResponse> {
  const response = await fetch(`${API_BASE}/api/membership/purchase`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      cardType: planId,
      channel,
    }),
  });

  const result: ApiResponse<{
    orderId: string;
    orderNo: string;
    amount: number;
    paymentUrl?: string;
  }> = await response.json();
  
  if (!result.success) {
    throw new Error(result.message || '创建订单失败');
  }
  
  // Transform backend response to frontend expected format
  return {
    orderId: result.data!.orderId,
    orderNo: result.data!.orderNo,
    amount: result.data!.amount,
    paymentUrl: result.data!.paymentUrl,
  };
}

/**
 * Get order status
 */
export async function getOrderStatus(orderId: string): Promise<{
  orderId: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paidAt?: string;
}> {
  const response = await fetch(`${API_BASE}/api/orders/${orderId}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<{
    id: string;
    orderNo: string;
    type: string;
    amount: number;
    status: 'pending' | 'paid' | 'failed' | 'refunded';
    paymentChannel: string;
    transactionId?: string;
    createdAt: string;
    updatedAt: string;
  }> = await response.json();
  
  if (!result.success) {
    throw new Error(result.message || '获取订单状态失败');
  }
  
  return {
    orderId: result.data!.id,
    status: result.data!.status,
    paidAt: result.data!.status === 'paid' ? result.data!.updatedAt : undefined,
  };
}

export async function redeemMembershipCode(code: string): Promise<RedeemResult> {
  const response = await fetch(`${API_BASE}/api/membership/redeem`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ code }),
  });

  const result: ApiResponse<RedeemResult> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.message || '兑换失败');
  }

  return result.data;
}
