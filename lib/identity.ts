import { IdentitystoreClient, ListUsersCommand } from '@aws-sdk/client-identitystore';
import { maskText, maskEmail } from './mask';
import { getOrgProvider } from './org/provider';

const client = new IdentitystoreClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

function applyEmployeeOverlay(
  base: UserDetail,
  emp: { displayName?: string; department?: string; team?: string; jobGrade?: string } | undefined,
): UserDetail {
  if (!emp) return base;
  return {
    ...base,
    displayName: emp.displayName ? maskText(emp.displayName) : base.displayName,
    department: emp.department,
    team: emp.team,
    jobGrade: emp.jobGrade,
  };
}

export interface UserDetail {
  username: string;
  displayName: string;
  email: string;
  organization: string;
  department?: string;
  team?: string;
  jobGrade?: string;
}

export async function resolveUserDetails(userIds: string[]): Promise<Map<string, UserDetail>> {
  // Clean IDs (strip d-xxxxx. prefix)
  const cleanIds = userIds.map(id => id.replace(/^d-[a-z0-9]+\./, ''));

  const result = new Map<string, UserDetail>();
  const identityStoreId = process.env.IDENTITY_STORE_ID || '';

  if (!identityStoreId) {
    for (const id of cleanIds) {
      result.set(id, { username: maskText(id.substring(0, 8)), displayName: maskText(id.substring(0, 8)), email: '', organization: '' });
    }
    return result;
  }

  try {
    // Paginate ListUsers to get all IdC users
    let allUsers: any[] = [];
    let nextToken: string | undefined;
    do {
      const response = await client.send(new ListUsersCommand({
        IdentityStoreId: identityStoreId,
        ...(nextToken ? { NextToken: nextToken } : {})
      }));
      allUsers.push(...(response.Users || []));
      nextToken = response.NextToken;
    } while (nextToken);

    // Build a userId -> { detail, rawEmail } map. rawEmail is needed for OrgProvider lookup.
    const userMap = new Map<string, { detail: UserDetail; rawEmail: string }>();
    for (const u of allUsers) {
      const rawEmail = u.Emails?.[0]?.Value || u.UserName || '';
      const rawOrg = rawEmail.split('@')[1] || '';
      userMap.set(u.UserId!, {
        rawEmail,
        detail: {
          username: maskText(u.UserName || u.DisplayName || u.UserId!),
          displayName: maskText(u.DisplayName || u.UserName || u.UserId!),
          email: maskEmail(rawEmail),
          organization: maskText(rawOrg),
        },
      });
    }

    // Overlay organization metadata from OrgProvider (mock / company DB / M365).
    const emailsToLookup = Array.from(userMap.values()).map((v) => v.rawEmail).filter(Boolean);
    const employeeMap = await getOrgProvider().getByEmails(emailsToLookup);

    for (const id of cleanIds) {
      const entry = userMap.get(id);
      if (entry) {
        const emp = employeeMap.get(entry.rawEmail);
        result.set(id, applyEmployeeOverlay(entry.detail, emp));
      } else {
        result.set(id, {
          username: maskText(id.substring(0, 8)),
          displayName: maskText(id.substring(0, 8)),
          email: '',
          organization: '',
        });
      }
    }
  } catch {
    for (const id of cleanIds) {
      result.set(id, { username: maskText(id.substring(0, 8)), displayName: maskText(id.substring(0, 8)), email: '', organization: '' });
    }
  }

  return result;
}

interface CacheEntry {
  username: string;
  cachedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour in milliseconds
const cache = new Map<string, CacheEntry>();

export async function resolveUsernames(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const identityStoreId = process.env.IDENTITY_STORE_ID;

  // Strip any Identity Store ID prefix that may have survived Athena normalization
  const cleanIds = userIds.map(id => id.replace(/^d-[a-z0-9]+\./, ''));

  if (!identityStoreId) {
    for (const id of cleanIds) {
      result.set(id, maskText(id.substring(0, 8)));
    }
    return result;
  }

  const now = Date.now();
  const uncachedIds: string[] = [];

  // Serve from cache where valid
  for (const id of cleanIds) {
    const entry = cache.get(id);
    if (entry && now - entry.cachedAt < TTL_MS) {
      result.set(id, entry.username);
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) {
    return result;
  }

  try {
    // Batch resolve uncached ids via Identity Center
    const response = await client.send(
      new ListUsersCommand({
        IdentityStoreId: identityStoreId,
      })
    );

    const users = response.Users ?? [];

    // Build a lookup map from the API response
    const apiLookup = new Map<string, string>();
    for (const user of users) {
      if (user.UserId) {
        const username = maskText(
          user.UserName ??
          user.DisplayName ??
          user.UserId.substring(0, 8));
        apiLookup.set(user.UserId, username);
      }
    }

    // Populate result and update cache
    for (const id of uncachedIds) {
      const username = apiLookup.get(id) ?? maskText(id.substring(0, 8));
      result.set(id, username);
      cache.set(id, { username, cachedAt: now });
    }
  } catch {
    for (const id of uncachedIds) {
      result.set(id, maskText(id.substring(0, 8)));
    }
  }

  return result;
}
