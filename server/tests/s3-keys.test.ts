import { describe, expect, it } from 'vitest';
import { orgScopedKey, projectScopedKey } from '../src/config/s3';

describe('object storage key helpers', () => {
  it('builds organization-scoped keys', () => {
    expect(orgScopedKey('org_123', 'documents', 'abc.pdf')).toBe('org/org_123/documents/abc.pdf');
  });

  it('builds project-scoped keys', () => {
    expect(projectScopedKey('org_123', 'proj_9', 'drawings', 'plan.svg')).toBe(
      'org/org_123/projects/proj_9/drawings/plan.svg',
    );
  });

  it('handles arbitrary nesting', () => {
    expect(orgScopedKey('o1', 'a', 'b', 'c')).toBe('org/o1/a/b/c');
  });
});
