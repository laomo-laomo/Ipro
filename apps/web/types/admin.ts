export interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  recentOrders: Array<{
    id: string;
    orderNo: string;
    userNickname: string | null;
    amount: number;
    type: string;
    paymentChannel: string | null;
    createdAt: string;
  }>;
}

export interface AdminOrderList {
  orders: Array<{
    id: string;
    orderNo: string;
    userId: string;
    userNickname: string | null;
    type: string;
    amount: number;
    status: string;
    paymentChannel: string | null;
    transactionId: string | null;
    createdAt: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface AdminOrderDetail {
  id: string;
  orderNo: string;
  type: string;
  amount: number;
  status: string;
  paymentChannel: string | null;
  transactionId: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    nickname: string | null;
    phone: string | null;
    avatar: string | null;
    role: string;
    points: number;
  };
  paymentLogs: Array<{
    id: string;
    channel: string;
    event: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

export interface AdminUserList {
  users: Array<{
    id: string;
    nickname: string | null;
    phone: string | null;
    avatar: string | null;
    voicesCount: number;
    storiesCount: number;
    ordersCount: number;
    createdAt: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserDetail {
  id: string;
  nickname: string | null;
  phone: string | null;
  avatar: string | null;
  role: string;
  points: number;
  createdAt: string;
  memberships: Array<{
    id: string;
    cardType: string;
    quota: number;
    usedQuota: number;
    expiresAt: string;
    status: string;
    createdAt: string;
  }>;
  orders: Array<{
    id: string;
    orderNo: string;
    type: string;
    amount: number;
    status: string;
    paymentChannel: string | null;
    createdAt: string;
  }>;
  stories: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
  }>;
  voices: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }>;
  redeemCodes: Array<{
    id: string;
    code: string;
    rewardType: string;
    pointsAmount: number | null;
    membershipTier: string | null;
    status: string;
    usedAt: string | null;
  }>;
}

export interface AdminRedeemCodeCreateResult {
  rewardType: 'points' | 'membership';
  count: number;
  codes: string[];
  batchTimestamp: string;
  pointsAmount: number | null;
  membershipTier: 'times' | 'times1' | 'times10' | 'times50' | 'times100' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;
  expiresAt: string | null;
  note: string | null;
}

export interface AdminRedeemCodeList {
  codes: Array<{
    id: string;
    code: string;
    rewardType: 'points' | 'membership';
    pointsAmount: number | null;
    membershipTier: 'times' | 'times1' | 'times10' | 'times50' | 'times100' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null;
    expiresAt: string | null;
    usedAt: string | null;
    status: 'active' | 'used' | 'expired' | 'disabled';
    note: string | null;
    createdAt: string;
    usedByUser: {
      id: string;
      nickname: string | null;
      phone: string | null;
    } | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface AdminRedeemCodeFilters {
  status?: 'active' | 'used' | 'expired' | 'disabled';
  rewardType?: 'points' | 'membership';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AdminPriceMap {
  [key: string]: number;
}
