import type { Employee, OrgProvider } from './types';
import { MOCK_EMPLOYEES } from './mock-data';

class MockOrgProvider implements OrgProvider {
  private byEmail: Map<string, Employee>;

  constructor(employees: Employee[]) {
    this.byEmail = new Map(employees.map((e) => [e.email.toLowerCase(), e]));
  }

  async getByEmails(emails: string[]): Promise<Map<string, Employee>> {
    const result = new Map<string, Employee>();
    for (const email of emails) {
      if (!email) continue;
      const hit = this.byEmail.get(email.toLowerCase());
      if (hit) result.set(email, hit);
    }
    return result;
  }
}

let cached: OrgProvider | null = null;

export function getOrgProvider(): OrgProvider {
  if (cached) return cached;
  const kind = process.env.ORG_PROVIDER ?? 'mock';
  switch (kind) {
    // case 'company-db':
    //   cached = new CompanyDbOrgProvider(...);
    //   break;
    case 'mock':
    default:
      cached = new MockOrgProvider(MOCK_EMPLOYEES);
  }
  return cached;
}
