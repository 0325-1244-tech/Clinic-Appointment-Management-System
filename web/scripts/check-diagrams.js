// @ts-check
/**
 * Checks that the UML class diagrams in docs/DOCUMENTATION.md match the code.
 *
 * For every Mermaid `classDiagram` block it verifies that:
 *   - each class exists in web/src or web/public,
 *   - each member listed in the diagram exists in that class (or a parent class),
 *   - each `Parent <|-- Child` arrow matches `class Child extends Parent`.
 *
 * Run with `npm run check:diagrams`. Exits with code 1 and a list of problems
 * if anything in the diagram is not in the code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const docFile = path.resolve(webRoot, '..', 'docs', 'DOCUMENTATION.md');

/** @typedef {{ name: string, parent: string | null, members: Set<string>, file: string }} CodeClass */

/** @param {string} dir @returns {string[]} */
function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** Reads every class declaration with its parent and member names. @returns {Map<string, CodeClass>} */
export function scanCode() {
  /** @type {Map<string, CodeClass>} */
  const classes = new Map();
  for (const file of [...jsFiles(path.join(webRoot, 'src')), ...jsFiles(path.join(webRoot, 'public', 'app'))]) {
    const source = fs.readFileSync(file, 'utf8');
    const pattern = /^export class (\w+)(?: extends (\w+))? \{|^class (\w+)(?: extends (\w+))? \{/gm;
    let match;
    while ((match = pattern.exec(source))) {
      const name = match[1] ?? match[3];
      const parent = match[2] ?? match[4] ?? null;
      const body = classBody(source, pattern.lastIndex);
      const members = new Set();
      for (const line of body.split('\n')) {
        const m = /^ {2}(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(#?\w+)\s*(?:\(|=|;)/.exec(line);
        if (m && m[1] !== 'constructor' || /^ {2}constructor\(/.test(line)) {
          members.add(m ? m[1].replace(/^#/, '') : 'constructor');
        }
      }
      classes.set(name, { name, parent, members, file: path.relative(webRoot, file) });
    }
  }
  return classes;
}

/** Text from an opening brace to its matching closing brace. @param {string} source @param {number} start */
function classBody(source, start) {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  return source.slice(start, i - 1);
}

/** @param {string} markdown */
export function parseDiagrams(markdown) {
  const blocks = [...markdown.matchAll(/```mermaid\s*\n\s*classDiagram\b([\s\S]*?)```/g)].map((m) => m[1]);
  /** @type {Map<string, Set<string>>} */
  const classes = new Map();
  /** @type {[string, string][]} parent, child */
  const inherits = [];
  for (const block of blocks) {
    for (const m of block.matchAll(/class (\w+)(?:~[^~]+~)?\s*\{([\s\S]*?)\}/g)) {
      const members = classes.get(m[1]) ?? new Set();
      for (const raw of m[2].split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('<<') || line.startsWith('%%')) continue;
        const member = /^[+\-#~]?\s*(?:static\s+)?(?:get\s+|set\s+)?(\w+)/.exec(line);
        if (member) members.add(member[1]);
      }
      classes.set(m[1], members);
    }
    for (const m of block.matchAll(/^\s*(\w+)\s*<\|--\s*(\w+)/gm)) {
      inherits.push([m[1], m[2]]);
      if (!classes.has(m[1])) classes.set(m[1], new Set());
      if (!classes.has(m[2])) classes.set(m[2], new Set());
    }
  }
  return { blockCount: blocks.length, classes, inherits };
}

/** Members of a class including everything it inherits. @param {Map<string, CodeClass>} code @param {string} name */
function allMembers(code, name) {
  const members = new Set();
  /** @type {string | null} */
  let current = name;
  while (current && code.has(current)) {
    const cls = /** @type {CodeClass} */ (code.get(current));
    cls.members.forEach((m) => members.add(m));
    current = cls.parent;
  }
  return members;
}

/** Built-in parents that are not declared in the project. */
const BUILT_INS = new Set(['Error', 'EventEmitter', 'EventTarget', 'HTMLElement']);

function main() {
  const code = scanCode();
  const { blockCount, classes, inherits } = parseDiagrams(fs.readFileSync(docFile, 'utf8'));
  const problems = [];
  if (blockCount === 0) problems.push('No Mermaid classDiagram blocks found in docs/DOCUMENTATION.md.');
  for (const [name, members] of classes) {
    if (BUILT_INS.has(name)) continue;
    if (!code.has(name)) {
      problems.push(`Class ${name} is in the diagram but not in the code.`);
      continue;
    }
    const available = allMembers(code, name);
    for (const member of members) {
      if (!available.has(member)) problems.push(`${name}.${member} is in the diagram but not in ${code.get(name)?.file}.`);
    }
  }
  for (const [parent, child] of inherits) {
    const cls = code.get(child);
    if (cls && cls.parent !== parent) {
      problems.push(`Diagram says ${child} extends ${parent}, but the code says ${cls.parent ?? 'nothing'}.`);
    }
  }
  if (problems.length > 0) {
    console.error(`Class diagrams do not match the code (${problems.length} problem(s)):`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  console.info(`Class diagrams match the code: ${classes.size} classes and ${inherits.length} inheritance arrows in ${blockCount} diagram(s) checked.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
