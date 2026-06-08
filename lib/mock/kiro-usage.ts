/**
 * Mock Kiro 사용량 데이터 — 실제 Athena 연결 전 UI/매핑 검증용.
 *
 * 활성화: .env.local 의 USE_MOCK_USAGE=true
 *
 * email 을 join key 로 OrgProvider(lib/org/) 와 매칭된다.
 * userid 는 email 에서 결정적(deterministic) 으로 생성한다 — user-detail 페이지 링크가 안정적으로 유지되도록.
 */

import { createHash } from 'crypto';

export interface MockUsageRecord {
  email: string;
  displayName: string;
  totalMessages: number;
  totalCredits: number;
  totalConversations: number;
  totalOverageCredits: number;
  activeDays: number;
  firstActive: string;
  lastActive: string;
  clientBreakdown: Array<{ clientType: string; messages: number; credits: number }>;
  dailyActivity: Array<{
    date: string;
    messages: number;
    conversations: number;
    credits: number;
    clientType: string;
  }>;
}

/** email -> deterministic 36-char UUID (matches USERID_RE in user-detail route). */
export function emailToMockUserId(email: string): string {
  const h = createHash('sha1').update(email.toLowerCase()).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-');
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function buildDaily(
  count: number,
  baseMessages: number,
  baseCredits: number,
  clientType: string,
) {
  return Array.from({ length: count }, (_, i) => ({
    date: daysAgo(i),
    messages: Math.round(baseMessages * (0.6 + Math.random() * 0.8)),
    conversations: Math.round((baseMessages / 4) * (0.6 + Math.random() * 0.8)),
    credits: +(baseCredits * (0.6 + Math.random() * 0.8)).toFixed(1),
    clientType,
  }));
}

export const MOCK_KIRO_USAGE: MockUsageRecord[] = [
  {
    email: 'hrpark@neungyule.com',
    displayName: '박혜련',
    totalMessages: 1284,
    totalCredits: 312.5,
    totalConversations: 287,
    totalOverageCredits: 0,
    activeDays: 28,
    firstActive: daysAgo(60),
    lastActive: today(),
    clientBreakdown: [
      { clientType: 'KIRO_IDE', messages: 980, credits: 240.3 },
      { clientType: 'KIRO_CLI', messages: 304, credits: 72.2 },
    ],
    dailyActivity: buildDaily(28, 45, 11, 'KIRO_IDE'),
  },
  {
    email: 'cyberpd@neungyule.com',
    displayName: '정병용',
    totalMessages: 942,
    totalCredits: 215.0,
    totalConversations: 198,
    totalOverageCredits: 0,
    activeDays: 22,
    firstActive: daysAgo(45),
    lastActive: daysAgo(1),
    clientBreakdown: [{ clientType: 'KIRO_IDE', messages: 942, credits: 215.0 }],
    dailyActivity: buildDaily(22, 42, 9, 'KIRO_IDE'),
  },
  {
    email: 'mjsun@neungyule.com',
    displayName: '선민재',
    totalMessages: 612,
    totalCredits: 140.2,
    totalConversations: 130,
    totalOverageCredits: 5.2,
    activeDays: 18,
    firstActive: daysAgo(50),
    lastActive: daysAgo(3),
    clientBreakdown: [
      { clientType: 'KIRO_IDE', messages: 500, credits: 120.0 },
      { clientType: 'PLUGIN', messages: 112, credits: 20.2 },
    ],
    dailyActivity: buildDaily(18, 34, 8, 'KIRO_IDE'),
  },
];

export function isMockUsageEnabled(): boolean {
  return (process.env.USE_MOCK_USAGE ?? '').toLowerCase() === 'true';
}

export function findMockUsageByUserId(userId: string): MockUsageRecord | undefined {
  return MOCK_KIRO_USAGE.find((r) => emailToMockUserId(r.email) === userId);
}

// ---------------------------------------------------------------
// 대시보드 위젯용 집계 헬퍼 — 모두 MOCK_KIRO_USAGE 에서 파생
// ---------------------------------------------------------------

export function getMockMetricsTotals() {
  const totals = MOCK_KIRO_USAGE.reduce(
    (acc, r) => {
      acc.totalMessages += r.totalMessages;
      acc.totalConversations += r.totalConversations;
      acc.totalCredits += r.totalCredits;
      acc.totalOverageCredits += r.totalOverageCredits;
      return acc;
    },
    { totalMessages: 0, totalConversations: 0, totalCredits: 0, totalOverageCredits: 0 },
  );
  return {
    totalUsers: MOCK_KIRO_USAGE.length,
    ...totals,
    // 임의 변화율 (mock 환경 표시용)
    changeRates: {
      totalUsers: 0,
      totalMessages: 12.3,
      totalConversations: 8.1,
      totalCredits: 15.7,
      totalOverageCredits: -2.4,
    },
  };
}

export function getMockTrends(days: number) {
  const byDate = new Map<
    string,
    { messages: number; conversations: number; credits: number; users: Set<string> }
  >();
  for (const r of MOCK_KIRO_USAGE) {
    for (const d of r.dailyActivity) {
      if (!byDate.has(d.date)) {
        byDate.set(d.date, { messages: 0, conversations: 0, credits: 0, users: new Set() });
      }
      const slot = byDate.get(d.date)!;
      slot.messages += d.messages;
      slot.conversations += d.conversations;
      slot.credits += d.credits;
      slot.users.add(r.email);
    }
  }
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return Array.from(byDate.entries())
    .filter(([date]) => date >= cutoff)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      messages: v.messages,
      conversations: v.conversations,
      credits: +v.credits.toFixed(1),
      activeUsers: v.users.size,
    }));
}

export function getMockClientDist() {
  const byClient = new Map<string, { messageCount: number; creditCount: number }>();
  for (const r of MOCK_KIRO_USAGE) {
    for (const c of r.clientBreakdown) {
      if (!byClient.has(c.clientType)) {
        byClient.set(c.clientType, { messageCount: 0, creditCount: 0 });
      }
      const slot = byClient.get(c.clientType)!;
      slot.messageCount += c.messages;
      slot.creditCount += c.credits;
    }
  }
  const total = Array.from(byClient.values()).reduce((s, v) => s + v.messageCount, 0);
  return Array.from(byClient.entries()).map(([clientType, v]) => ({
    clientType,
    messageCount: v.messageCount,
    creditCount: +v.creditCount.toFixed(1),
    percentage: total > 0 ? Math.round((v.messageCount / total) * 100) : 0,
  }));
}

/** 모델별 메시지 가중치 — 사용자별 모델 사용량을 결정적으로 분배. */
const MOCK_MODEL_WEIGHTS: Record<string, number> = {
  'Claude Sonnet 4 6': 0.55,
  'Claude Opus 4 7': 0.25,
  'Claude Haiku 4 5': 0.20,
};

export function getMockCreditAnalysis(employeeMap: Map<string, { displayName?: string; department?: string; team?: string; jobGrade?: string }>) {
  const sorted = [...MOCK_KIRO_USAGE].sort((a, b) => b.totalCredits - a.totalCredits);
  const topUsers = sorted.map((r) => {
    const emp = employeeMap.get(r.email);
    return {
      userid: emailToMockUserId(r.email),
      username: r.email,
      displayName: emp?.displayName || r.displayName,
      email: r.email,
      organization: r.email.split('@')[1] || '',
      department: emp?.department,
      team: emp?.team,
      jobGrade: emp?.jobGrade,
      totalCredits: r.totalCredits,
      overageCredits: r.totalOverageCredits,
    };
  });
  const totals = MOCK_KIRO_USAGE.reduce(
    (acc, r) => {
      acc.base += r.totalCredits - r.totalOverageCredits;
      acc.overage += r.totalOverageCredits;
      return acc;
    },
    { base: 0, overage: 0 },
  );
  return {
    topUsers,
    baseVsOverage: { base: +totals.base.toFixed(1), overage: +totals.overage.toFixed(1) },
    byTier: [
      {
        tier: 'PRO',
        userCount: MOCK_KIRO_USAGE.length,
        totalCredits: +MOCK_KIRO_USAGE.reduce((s, r) => s + r.totalCredits, 0).toFixed(1),
      },
    ],
  };
}

export function getMockModelUsage() {
  const modelNames = Object.keys(MOCK_MODEL_WEIGHTS);
  const distribution = modelNames.map((m) => {
    const messages = Math.round(
      MOCK_KIRO_USAGE.reduce((s, r) => s + r.totalMessages, 0) * MOCK_MODEL_WEIGHTS[m],
    );
    return { model: m, messages };
  });
  const grand = distribution.reduce((s, d) => s + d.messages, 0);
  const distributionWithPct = distribution.map((d) => ({
    ...d,
    percentage: grand > 0 ? (d.messages / grand) * 100 : 0,
  }));

  // 일자별 trend — 각 사용자 dailyActivity 합산 후 모델 비율로 분배
  const byDate = new Map<string, number>();
  for (const r of MOCK_KIRO_USAGE) {
    for (const d of r.dailyActivity) {
      byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.messages);
    }
  }
  const trend = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => {
      const point: Record<string, string | number> = { date };
      for (const m of modelNames) {
        point[m] = Math.round(total * MOCK_MODEL_WEIGHTS[m]);
      }
      return point;
    });

  const userPreferences = MOCK_KIRO_USAGE.map((r) => {
    const models: Record<string, number> = {};
    let max = 0;
    let primary = '';
    for (const m of modelNames) {
      const c = Math.round(r.totalMessages * MOCK_MODEL_WEIGHTS[m]);
      models[m] = c;
      if (c > max) {
        max = c;
        primary = m;
      }
    }
    return {
      userid: emailToMockUserId(r.email),
      displayName: r.displayName,
      models,
      totalMessages: r.totalMessages,
      primaryModel: primary,
    };
  }).sort((a, b) => b.totalMessages - a.totalMessages);

  return {
    distribution: distributionWithPct,
    trend,
    userPreferences,
    availableModels: modelNames,
  };
}

export function classifyTier(msgs: number, convs: number): 'Power' | 'Active' | 'Light' | 'Idle' {
  if (msgs >= 100 || convs >= 20) return 'Power';
  if (msgs >= 20 || convs >= 5) return 'Active';
  if (msgs >= 1) return 'Light';
  return 'Idle';
}

