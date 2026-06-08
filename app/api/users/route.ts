import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { resolveUserDetails } from '@/lib/identity';
import { maskText, maskEmail } from '@/lib/mask';
import { TopUser } from '@/types/dashboard';
import {
  MOCK_KIRO_USAGE,
  emailToMockUserId,
  isMockUsageEnabled,
} from '@/lib/mock/kiro-usage';
import { getOrgProvider } from '@/lib/org/provider';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));
    const limit = parseInt(searchParams.get('limit') ?? '10', 10);

    if (isMockUsageEnabled()) {
      const emails = MOCK_KIRO_USAGE.map((r) => r.email);
      const employeeMap = await getOrgProvider().getByEmails(emails);
      const sorted = [...MOCK_KIRO_USAGE]
        .sort((a, b) => b.totalMessages - a.totalMessages)
        .slice(0, limit);
      const users: TopUser[] = sorted.map((r, i) => {
        const emp = employeeMap.get(r.email);
        return {
          userid: emailToMockUserId(r.email),
          username: maskEmail(r.email),
          displayName: maskText(emp?.displayName || r.displayName),
          email: maskEmail(r.email),
          organization: maskText(r.email.split('@')[1] || ''),
          department: emp?.department,
          team: emp?.team,
          jobGrade: emp?.jobGrade,
          totalMessages: r.totalMessages,
          totalCredits: r.totalCredits,
          rank: i + 1,
        };
      });
      return NextResponse.json(users);
    }

    const tableName = await resolveTableName();

    const sql = `
      SELECT
        ${NORMALIZE_USERID} AS userid,
        SUM(CAST(total_messages AS INTEGER)) AS total_messages,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY ${NORMALIZE_USERID}
      ORDER BY total_messages DESC
      LIMIT ${limit}
    `;

    const rows = await executeQuery(sql);

    const rawIds = rows.map((row) => row.userid.replace(/^['"]|['"]$/g, ''));
    const detailMap = await resolveUserDetails(rawIds);

    const users: TopUser[] = rows.map((row, index) => {
      const userid = row.userid.replace(/^['"]|['"]$/g, '');
      const detail = detailMap.get(userid);
      return {
        userid,
        username: detail?.email || detail?.username || maskText(userid.substring(0, 8)),
        displayName: detail?.displayName || maskText(userid.substring(0, 8)),
        email: detail?.email || '',
        organization: detail?.organization || '',
        department: detail?.department,
        team: detail?.team,
        jobGrade: detail?.jobGrade,
        totalMessages: safeInt(row.total_messages),
        totalCredits: safeFloat(row.total_credits),
        rank: index + 1,
      };
    });

    return NextResponse.json(users);
  } catch (err) {
    console.error('[/api/users] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
