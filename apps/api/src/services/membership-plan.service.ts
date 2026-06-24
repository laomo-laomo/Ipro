import { prisma } from '../config/database.js';
import { MEMBERSHIP_PLANS, type MembershipPlanConfig, type MembershipTier } from '../config/membership.js';

const MEMBERSHIP_RULES_KEY = 'membershipRules';

export type AdminMembershipPlan = MembershipPlanConfig & {
  enabled: boolean;
  section: 'subscription' | 'payAsYouGo';
  sortOrder: number;
};

function inferSection(plan: MembershipPlanConfig): 'subscription' | 'payAsYouGo' {
  if (plan.section === 'subscription' || plan.section === 'payAsYouGo') return plan.section;
  if (plan.type === 'points') return 'payAsYouGo';
  if (plan.dailyStoryLimit || plan.periodDays <= 365) return 'subscription';
  return 'payAsYouGo';
}

function normalizePlan(plan: MembershipPlanConfig, index = 0): AdminMembershipPlan {
  return {
    ...plan,
    id: String(plan.id).trim(),
    name: String(plan.name || plan.id).trim(),
    type: plan.type === 'points' ? 'points' : 'card',
    section: inferSection(plan),
    originalPrice: Number(plan.originalPrice || 0),
    price: Number(plan.price || 0),
    periodDays: Number(plan.periodDays || 0),
    pricePerDay: Number(plan.pricePerDay || 0),
    maxScenes: plan.maxScenes === undefined ? undefined : Number(plan.maxScenes),
    dailyStoryLimit: plan.dailyStoryLimit === undefined ? undefined : Number(plan.dailyStoryLimit),
    pointsPerYuan: plan.pointsPerYuan === undefined ? undefined : Number(plan.pointsPerYuan),
    pointsPerScene: plan.pointsPerScene === undefined ? undefined : Number(plan.pointsPerScene),
    features: Array.isArray(plan.features) ? plan.features.map(String).filter(Boolean) : [],
    popular: Boolean(plan.popular),
    enabled: plan.enabled !== false,
    sortOrder: Number.isFinite(Number(plan.sortOrder)) ? Number(plan.sortOrder) : index,
  };
}

export function getDefaultMembershipPlans(): AdminMembershipPlan[] {
  return MEMBERSHIP_PLANS.map((plan, index) => normalizePlan(plan, index));
}

function parseStoredPlans(raw: string | null | undefined): AdminMembershipPlan[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((plan, index) => normalizePlan(plan, index)).filter((plan) => plan.id && plan.name);
  } catch {
    return null;
  }
}

export async function getAdminMembershipPlans(): Promise<AdminMembershipPlan[]> {
  const config = await prisma.priceConfig.findUnique({ where: { key: MEMBERSHIP_RULES_KEY } });
  const storedPlans = parseStoredPlans(config?.description);
  const plans = storedPlans && storedPlans.length ? storedPlans : getDefaultMembershipPlans();
  return plans.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'));
}

export async function getAvailableMembershipPlans(): Promise<AdminMembershipPlan[]> {
  const plans = await getAdminMembershipPlans();
  return plans.filter((plan) => plan.enabled);
}

export async function saveAdminMembershipPlans(plans: MembershipPlanConfig[], updatedBy?: string): Promise<AdminMembershipPlan[]> {
  const normalized = plans.map((plan, index) => normalizePlan(plan, index));
  const ids = new Set<string>();
  for (const plan of normalized) {
    if (!plan.id) throw new Error('套餐 ID 不能为空');
    if (ids.has(plan.id)) throw new Error(`套餐 ID 重复: ${plan.id}`);
    ids.add(plan.id);
    if (!plan.name) throw new Error('套餐名称不能为空');
    if (plan.price < 0) throw new Error(`${plan.name} 价格不能小于 0`);
    if (plan.periodDays <= 0) throw new Error(`${plan.name} 有效期必须大于 0`);
  }

  await prisma.priceConfig.upsert({
    where: { key: MEMBERSHIP_RULES_KEY },
    update: { value: normalized.length, description: JSON.stringify(normalized), updatedBy },
    create: { key: MEMBERSHIP_RULES_KEY, value: normalized.length, description: JSON.stringify(normalized), updatedBy },
  });

  return normalized.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'));
}

export async function getMembershipPlanById(planId: MembershipTier): Promise<AdminMembershipPlan | undefined> {
  const plans = await getAdminMembershipPlans();
  return plans.find((plan) => plan.id === planId);
}

export async function getEnabledMembershipPlanById(planId: MembershipTier): Promise<AdminMembershipPlan | undefined> {
  const plans = await getAvailableMembershipPlans();
  return plans.find((plan) => plan.id === planId);
}

export default {
  getDefaultMembershipPlans,
  getAdminMembershipPlans,
  getAvailableMembershipPlans,
  saveAdminMembershipPlans,
  getMembershipPlanById,
  getEnabledMembershipPlanById,
};
