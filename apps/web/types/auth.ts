// Auth types

export interface User {
  id: string;
  nickname: string | null;
  avatar: string | null;
  phone?: string | null;
  role?: 'user' | 'admin';
  hasMembership: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginWithPhoneParams {
  phone: string;
  code: string;
}

export interface SendCodeParams {
  phone: string;
}

export interface WechatLoginParams {
  code: string;
}
