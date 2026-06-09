// Membership types

export type MembershipTier = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface MembershipPlan {
  id: MembershipTier;
  name: string;
  originalPrice: number;
  price: number;
  periodDays: number;
  features: string[];
  popular?: boolean;
  pricePerDay: number;
}

export interface MembershipStatus {
  isActive: boolean;
  tier: MembershipTier | null;
  expiresAt: string | null;
  remainingQuota: number;
  totalQuota: number;
}

export interface RedeemResult {
  rewardType: 'points' | 'membership';
  membershipTier?: MembershipTier | null;
  pointsAmount?: number | null;
  userPoints: number;
  membership: {
    hasMembership: boolean;
    totalQuota: number;
    usedQuota: number;
    remainingQuota: number;
    expiresAt: string | null;
    cardType: string | null;
    isWarning: boolean;
    warningMessage: string | null;
  };
}

export interface OrderCreateResponse {
  orderId: string;
  orderNo?: string;
  amount?: number;
  paymentUrl?: string;
  checkoutUrl?: string;
  qrCode?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Membership plans configuration
export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: 'weekly',
    name: '周卡',
    originalPrice: 0,
    price: 19.9,
    periodDays: 7,
    pricePerDay: 2.84,
    features: [
      '7天内无限使用',
      '生成故事绘本',
      '生成视频',
      '基础客服支持',
    ],
  },
  {
    id: 'monthly',
    name: '月卡',
    originalPrice: 0,
    price: 59,
    periodDays: 30,
    pricePerDay: 1.97,
    features: [
      '30天内无限使用',
      '生成故事绘本',
      '生成视频',
      '优先客服支持',
    ],
  },
  {
    id: 'quarterly',
    name: '季卡',
    originalPrice: 0,
    price: 159,
    periodDays: 90,
    pricePerDay: 1.77,
    popular: true,
    features: [
      '90天内无限使用',
      '生成故事绘本',
      '生成视频',
      '优先客服支持',
      '专属主题推荐',
    ],
  },
  {
    id: 'yearly',
    name: '年卡',
    originalPrice: 0,
    price: 499,
    periodDays: 365,
    pricePerDay: 1.37,
    features: [
      '365天内无限使用',
      '生成故事绘本',
      '生成视频',
      '专属客服支持',
      '专属主题推荐',
      '专属素材包',
    ],
  },
];

// Membership benefits
export const MEMBERSHIP_BENEFITS = [
  {
    icon: 'book-open',
    title: '故事绘本',
    description: '将照片转化为精美童话绘本',
  },
  {
    icon: 'video',
    title: '视频生成',
    description: '生成 MP4 视频故事',
  },
  {
    icon: 'sparkles',
    title: 'AI 风格化',
    description: '多种风格自由切换',
  },
  {
    icon: 'clock',
    title: '永久保存',
    description: '作品永久保存云端',
  },
];
