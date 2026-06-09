import { API_BASE, jsonHeaders } from './client';
import type { AdminOrderDetail, AdminOrderList, AdminPriceMap, AdminRedeemCodeCreateResult, AdminRedeemCodeFilters, AdminRedeemCodeList, AdminStats, AdminUserDetail, AdminUserList } from '@/types/admin';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const result: ApiResponse<T> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.message || fallbackMessage);
  }
  return result.data;
}

export async function getAdminStats(): Promise<AdminStats> {
  const response = await fetch(`${API_BASE}/api/admin/stats`, {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return readJson<AdminStats>(response, '获取管理员统计失败');
}

export async function getAdminOrders(params?: { status?: string; limit?: number; offset?: number }): Promise<AdminOrderList> {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (typeof params?.limit === 'number') search.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') search.set('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/api/admin/orders${search.toString() ? `?${search.toString()}` : ''}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return readJson<AdminOrderList>(response, '获取订单失败');
}

export async function getAdminOrderDetail(id: string): Promise<AdminOrderDetail> {
  const response = await fetch(`${API_BASE}/api/admin/orders/${id}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return readJson<AdminOrderDetail>(response, '获取订单详情失败');
}

export async function getAdminUsers(params?: { limit?: number; offset?: number }): Promise<AdminUserList> {
  const search = new URLSearchParams();
  if (typeof params?.limit === 'number') search.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') search.set('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/api/admin/users${search.toString() ? `?${search.toString()}` : ''}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return readJson<AdminUserList>(response, '获取用户失败');
}

export async function getAdminUserDetail(id: string): Promise<AdminUserDetail> {
  const response = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return readJson<AdminUserDetail>(response, '获取用户详情失败');
}

export async function getAdminPrices(): Promise<AdminPriceMap> {
  const response = await fetch(`${API_BASE}/api/admin/prices`, {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return readJson<AdminPriceMap>(response, '获取价格失败');
}

export async function updateAdminPrice(key: string, value: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/admin/prices`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify({ key, value }),
  });
  const result: ApiResponse<{ key: string; value: number }> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '更新价格失败');
  }
}

export async function createAdminRedeemCodes(body: {
  rewardType: 'points' | 'membership';
  count: number;
  pointsAmount?: number;
  membershipTier?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  expiresAt?: string;
  note?: string;
}): Promise<AdminRedeemCodeCreateResult> {
  const response = await fetch(`${API_BASE}/api/admin/redeem-codes`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  return readJson<AdminRedeemCodeCreateResult>(response, '创建兑换码失败');
}

export async function getAdminRedeemCodes(params?: AdminRedeemCodeFilters): Promise<AdminRedeemCodeList> {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.rewardType) search.set('rewardType', params.rewardType);
  if (params?.search) search.set('search', params.search);
  if (typeof params?.limit === 'number') search.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') search.set('offset', String(params.offset));

  const response = await fetch(`${API_BASE}/api/admin/redeem-codes${search.toString() ? `?${search.toString()}` : ''}`, {
    method: 'GET',
    headers: jsonHeaders(),
  });
  return readJson<AdminRedeemCodeList>(response, '获取兑换码失败');
}

export async function disableAdminRedeemCode(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/admin/redeem-codes/${id}/disable`, {
    method: 'PATCH',
    headers: jsonHeaders(),
  });
  const result: ApiResponse<{ id: string; status: string }> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '作废兑换码失败');
  }
}

export async function grantAdminUserPoints(id: string, points: number): Promise<{ id: string; points: number }> {
  const response = await fetch(`${API_BASE}/api/admin/users/${id}/grant-points`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ points }),
  });
  return readJson<{ id: string; points: number }>(response, '加积分失败');
}

export async function grantAdminUserMembership(id: string, body: { cardType: 'weekly' | 'monthly' | 'quarterly' | 'yearly'; quota: number; days: number }) {
  const response = await fetch(`${API_BASE}/api/admin/users/${id}/grant-membership`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  return readJson(response, '开通会员失败');
}
