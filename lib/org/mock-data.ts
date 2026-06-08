import type { Employee } from './types';

/**
 * 임시 직원 데이터 — 실제 사내 DB(또는 M365) 연동 전까지 테스트용.
 *
 * 교체 방법:
 *   1) lib/org/company-db.ts 와 같은 새 provider 구현
 *   2) lib/org/provider.ts 의 getOrgProvider() 에 분기 추가
 *   3) 환경변수 ORG_PROVIDER=company-db 로 전환
 *   4) 이 파일은 그대로 두거나 삭제 (mock 으로 폴백 시 사용)
 */
export const MOCK_EMPLOYEES: Employee[] = [
  {
    email: 'hrpark@neungyule.com',
    displayName: '박혜련',
    department: '정보전략실',
    team: 'Engineering팀',
    jobGrade: 'CL3',
  },
  {
    email: 'cyberpd@neungyule.com',
    displayName: '정병용',
    department: '정보전략실',
    team: 'Engineering팀',
    jobGrade: 'CL4',
  },
  {
    email: 'mjsun@neungyule.com',
    displayName: '선민재',
    department: '정보전략실',
    team: '',
    jobGrade: '실장',
  },
];
