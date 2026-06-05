import type {
  AuthResponse,
  LoginWithPhoneParams,
  SendCodeParams,
  WechatLoginParams,
} from '@/types/auth';
import { API_BASE, jsonHeaders } from './client';

/**
 * 微信登录
 */
export async function wechatLogin(params: WechatLoginParams): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/wechat-login`, {
    method: 'POST',
    headers: jsonHeaders(),
    credentials: 'include',
    body: JSON.stringify(params),
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || '微信登录失败');
  }
  return result.data;
}

/**
 * 发送手机验证码
 */
export async function sendPhoneCode(params: SendCodeParams): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/phone-code`, {
    method: 'POST',
    headers: jsonHeaders(),
    credentials: 'include',
    body: JSON.stringify(params),
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || '发送验证码失败');
  }
}

/**
 * 手机号登录
 */
export async function loginWithPhone(params: LoginWithPhoneParams): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/phone-login`, {
    method: 'POST',
    headers: jsonHeaders(),
    credentials: 'include',
    body: JSON.stringify(params),
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || '登录失败');
  }
  return result.data;
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(): Promise<AuthResponse['user'] | null> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    method: 'GET',
    headers: jsonHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  const result = await response.json();
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * 刷新 Token
 */
export async function refreshToken(): Promise<AuthResponse | null> {
  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: jsonHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    return null;
  }

  const result = await response.json();
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * 退出登录
 */
export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: jsonHeaders(),
    credentials: 'include',
  });
}
