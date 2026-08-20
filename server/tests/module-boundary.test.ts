import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const modulesDir = resolve(process.cwd(), 'src/modules');

interface Violation {
  file: string;
  module: string;
  target: string;
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

export function scanModules(dir: string): Violation[] {
  const violations: Violation[] = [];
  for (const file of collectFiles(dir)) {
    const rel = relative(dir, file).replace(/\\/g, '/');
    const segments = rel.split('/');
    const currentModule = segments[0];
    if (!currentModule || currentModule === 'index.ts') continue;

    const content = readFileSync(file, 'utf8');
    const importRe = /(?:import|export)\s.*?from\s+['"]([^'"]+)['"]/g;
    const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    const sources = [...content.matchAll(importRe), ...content.matchAll(dynamicRe)].map(
      (m) => m[1],
    );

    for (const source of sources) {
      if (!source.startsWith('.')) continue;
      const resolved = resolve(dirname(file), source);
      const relTarget = relative(dir, resolved).replace(/\\/g, '/');
      if (relTarget.startsWith('..') || relTarget === '' || relTarget.split('/').length <= 1) {
        continue;
      }
      const targetModule = relTarget.split('/')[0];
      if (targetModule !== undefined && targetModule !== currentModule) {
        violations.push({ file: rel, module: currentModule, target: source });
      }
    }
  }
  return violations;
}

describe('module boundary enforcement', () => {
  it('repository contains no cross-module internal imports', () => {
    const violations = scanModules(modulesDir);
    expect(violations).toEqual([]);
  });

  it('detects a fabricated cross-module import', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'module-boundary-'));
    const authDir = join(tmp, 'auth');
    const projectsDir = join(tmp, 'projects');
    mkdirSync(authDir, { recursive: true });
    mkdirSync(projectsDir, { recursive: true });
    writeFileSync(join(authDir, 'index.ts'), 'export default {};');
    writeFileSync(join(authDir, 'auth.service.ts'), 'import x from "../projects/project.model";');
    writeFileSync(join(projectsDir, 'project.model.ts'), 'export {};');
    const violations = scanModules(tmp);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.target).toBe('../projects/project.model');
  });

  it('allows importing a module through its public index', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'module-boundary-ok-'));
    const authDir = join(tmp, 'auth');
    const projectsDir = join(tmp, 'projects');
    mkdirSync(authDir, { recursive: true });
    mkdirSync(projectsDir, { recursive: true });
    writeFileSync(join(authDir, 'index.ts'), 'export default {};');
    writeFileSync(join(authDir, 'auth.service.ts'), 'import p from "../projects";');
    writeFileSync(join(projectsDir, 'index.ts'), 'export default {};');
    const violations = scanModules(tmp);
    expect(violations).toEqual([]);
  });
});
