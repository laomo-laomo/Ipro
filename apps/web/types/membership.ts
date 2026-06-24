// Membership types

export type MembershipTier = string;

export type MembershipType = 'points' | 'card';

export interface MembershipPlan {
  id: MembershipTier;
  name: string;
  type: MembershipType;
  section?: 'subscription' | 'payAsYouGo';
  originalPrice: number;
  price: number;
  periodDays: number;
  features: string[];
  popular?: boolean;
  pricePerDay: number;
  maxScenes?: number;
  dailyStoryLimit?: number;
  pointsPerYuan?: number;
  pointsPerScene?: number;
  enabled?: boolean;
  sortOrder?: number;
}

export interface MembershipStatus {
  isActive: boolean;
  tier: MembershipTier | null;
  expiresAt: string | null;
  remainingQuota: number;
  totalQuota: number;
  maxScenes: number | null;
  dailyStoryLimit: number | null;
  todayStoryCount: number;
  userPoints: number;
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
    maxScenes: number | null;
    dailyStoryLimit: number | null;
    todayStoryCount: number;
    userPoints: number;
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
  // === 积分制 ===
  {
    id: 'points',
    name: '积分充值',
    type: 'points',
    originalPrice: 0,
    price: 10,
    periodDays: 3650,
    pricePerDay: 0,
    pointsPerYuan: 100,
    pointsPerScene: 10,
    features: [
      '按页扣费，用多少付多少',
      '每页10积分（约0.1元）',
      '无每日数量限制',
      '支持所有功能',
    ],
  },
  // === 次卡 ===
  {
    id: 'times',
    name: '1次卡',
    type: 'card',
    originalPrice: 0,
    price: 9.9,
    periodDays: 3650,
    pricePerDay: 0,
    maxScenes: 20,
    features: [
      '1次创作机会',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  {
    id: 'times1',
    name: '1次卡',
    type: 'card',
    originalPrice: 0,
    price: 9.9,
    periodDays: 3650,
    pricePerDay: 0,
    maxScenes: 20,
    features: [
      '1次创作机会',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  {
    id: 'times10',
    name: '10次卡',
    type: 'card',
    originalPrice: 0,
    price: 89,
    periodDays: 3650,
    pricePerDay: 0,
    maxScenes: 20,
    features: [
      '10次创作机会',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  {
    id: 'times50',
    name: '50次卡',
    type: 'card',
    originalPrice: 0,
    price: 399,
    periodDays: 3650,
    pricePerDay: 0,
    maxScenes: 20,
    popular: true,
    features: [
      '50次创作机会',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  {
    id: 'times100',
    name: '100次卡',
    type: 'card',
    originalPrice: 0,
    price: 699,
    periodDays: 3650,
    pricePerDay: 0,
    maxScenes: 20,
    features: [
      '100次创作机会',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  // === 周期卡 ===
  {
    id: 'weekly',
    name: '周卡',
    type: 'card',
    originalPrice: 0,
    price: 19.9,
    periodDays: 7,
    pricePerDay: 2.84,
    maxScenes: 20,
    dailyStoryLimit: 5,
    features: [
      '7天内每天5个故事',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  {
    id: 'monthly',
    name: '月卡',
    type: 'card',
    originalPrice: 0,
    price: 59,
    periodDays: 30,
    pricePerDay: 1.97,
    maxScenes: 20,
    dailyStoryLimit: 5,
    features: [
      '30天内每天5个故事',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  {
    id: 'quarterly',
    name: '季卡',
    type: 'card',
    originalPrice: 0,
    price: 159,
    periodDays: 90,
    pricePerDay: 1.77,
    maxScenes: 20,
    dailyStoryLimit: 5,
    popular: true,
    features: [
      '90天内每天5个故事',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
    ],
  },
  {
    id: 'yearly',
    name: '年卡',
    type: 'card',
    originalPrice: 0,
    price: 499,
    periodDays: 365,
    pricePerDay: 1.37,
    maxScenes: 20,
    dailyStoryLimit: 5,
    features: [
      '365天内每天5个故事',
      '每个故事最多20页',
      '生成故事绘本',
      '生成视频',
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
