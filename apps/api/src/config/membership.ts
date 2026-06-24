// Membership plans configuration
//
// Two membership types:
// 1. 积分制 (Points): pay per page, no daily limit
// 2. 会员卡制 (Card):
//    - 次卡 (times): limited story count, max 20 scenes/story
//    - 周期卡 (period): daily story limit, max 20 scenes/story

export type MembershipTier = string;

export type MembershipType = 'points' | 'card';

export interface MembershipPlanConfig {
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
  /** Max scenes per story. 20 for all card types. */
  maxScenes?: number;
  /** Max stories per day. Only for period cards. */
  dailyStoryLimit?: number;
  /** Points per CNY for points-based system. */
  pointsPerYuan?: number;
  /** Cost in points per scene for points-based system. */
  pointsPerScene?: number;
  /** Whether the plan is visible and purchasable. Defaults to true. */
  enabled?: boolean;
  /** Stable sort order for admin-managed plans. */
  sortOrder?: number;
}

export const MEMBERSHIP_PLANS: MembershipPlanConfig[] = [
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

// Default quota for each plan (0 means unlimited for period cards)
export const MEMBERSHIP_DEFAULT_QUOTAS: Record<MembershipTier, number> = {
  points: 0,
  times: 1,
  times1: 1,
  times10: 10,
  times50: 50,
  times100: 100,
  weekly: 0,
  monthly: 0,
  quarterly: 0,
  yearly: 0,
};

// Max scenes per story for each tier (undefined = unlimited)
export const MEMBERSHIP_MAX_SCENES: Partial<Record<MembershipTier, number>> = {
  points: 20,
  times: 20,
  times1: 20,
  times10: 20,
  times50: 20,
  times100: 20,
  weekly: 20,
  monthly: 20,
  quarterly: 20,
  yearly: 20,
};

// Daily story limit for period cards (undefined = unlimited)
export const MEMBERSHIP_DAILY_STORY_LIMIT: Partial<Record<MembershipTier, number>> = {
  weekly: 5,
  monthly: 5,
  quarterly: 5,
  yearly: 5,
};

// Points cost per scene (for points-based system)
export const POINTS_PER_SCENE = 10;

// Get plan by ID
export function getPlanById(planId: MembershipTier): MembershipPlanConfig | undefined {
  return MEMBERSHIP_PLANS.find(p => p.id === planId);
}

// Get plan period in days
export function getPlanPeriodDays(planId: MembershipTier): number {
  const plan = getPlanById(planId);
  return plan?.periodDays || 0;
}

// Get plan type
export function getPlanType(planId: MembershipTier): MembershipType {
  const plan = getPlanById(planId);
  return plan?.type || 'card';
}
