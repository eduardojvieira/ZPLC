import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

export function cleanupMacExtendedAttributes(candidates, label) {
  const paths = unique(candidates);
  console.log(`${label} xattr cleanup candidates: ${JSON.stringify(paths)}`);

  for (const candidate of paths) {
    if (!existsSync(candidate)) {
      continue;
    }

    execFileSync('xattr', ['-cr', candidate], {
      stdio: 'inherit',
    });
  }
}
