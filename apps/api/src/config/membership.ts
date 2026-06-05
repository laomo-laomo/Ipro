// Membership plans configuration
export type MembershipTier = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface MembershipPlanConfig {
  id: MembershipTier;
  name: string;
  originalPrice: number;
  price: number;
  periodDays: number;
  features: string[];
  popular?: boolean;
  pricePerDay: number;
}

export const MEMBERSHIP_PLANS: MembershipPlanConfig[] = [
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

// Default quota for each plan (0 means unlimited)
export const MEMBERSHIP_DEFAULT_QUOTAS: Record<MembershipTier, number> = {
  weekly: 0,
  monthly: 0,
  quarterly: 0,
  yearly: 0,
};

// Get plan by ID
export function getPlanById(planId: MembershipTier): MembershipPlanConfig | undefined {
  return MEMBERSHIP_PLANS.find(p => p.id === planId);
}

// Get plan period in days
export function getPlanPeriodDays(planId: MembershipTier): number {
  const plan = getPlanById(planId);
  return plan?.periodDays || 0;
}