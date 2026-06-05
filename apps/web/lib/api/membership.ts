import type {
  MembershipStatus,
  MembershipPlan,
  OrderCreateResponse,
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
      credentials: 'include',
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
    };
  } catch {
    // Return default status if not logged in or error
    return {
      isActive: false,
      tier: null,
      expiresAt: null,
      remainingQuota: 0,
      totalQuota: 0,
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
      credentials: 'include',
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
 * Create order for membership
 * Uses backend POST /api/orders/create with correct fields
 */
export async function createMembershipOrder(
  planId: MembershipTier,
  channel: 'wechat' | 'alipay' | 'stripe'
): Promise<OrderCreateResponse> {
  const response = await fetch(`${API_BASE}/api/orders/create`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      type: 'membership',
      channel,
      metadata: {
        cardType: planId,
      },
    }),
    credentials: 'include',
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
    credentials: 'include',
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
