/**
 * 조직 정보 도메인 타입.
 * email을 join key로 Kiro/Bedrock 사용량 데이터와 매칭한다.
 */

export interface Employee {
  email: string;
  displayName: string;
  department?: string;
  team?: string;
  jobGrade?: string;
}

export interface OrgProvider {
  getByEmails(emails: string[]): Promise<Map<string, Employee>>;
}
