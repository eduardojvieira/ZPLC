/**
 * Test: Pico Blinky with TON Timer
 * 
 * Compiles the pico_blinky_ton project to verify TON timer integration works.
 */

import { compileMultiTaskProject } from './src/compiler';
import type { ProgramSource, ZPLCProjectConfig } from './src/compiler';
import { readFileSync } from 'fs';
import { join } from 'path';

const projectPath = join(__dirname, 'projects/pico_blinky_ton');

// Load project config
const configPath = join(projectPath, 'zplc.json');
const projectConfig: ZPLCProjectConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

// Load program source
const mainPath = join(projectPath, 'src/main.st');
const mainContent = readFileSync(mainPath, 'utf-8');

const programSources: ProgramSource[] = [
  { name: 'main', content: mainContent, language: 'ST' }
];

console.log('='.repeat(60));
console.log('PICO BLINKY TON - Compilation Test');
console.log('='.repeat(60));
console.log();

try {
  const result = compileMultiTaskProject(projectConfig, programSources);
  
  console.log('Compilation successful!');
  console.log();
  console.log('Statistics:');
  console.log(`  Total size: ${result.zplcFile.length} bytes`);
  console.log(`  Code size:  ${result.codeSize} bytes`);
  console.log(`  Tasks:      ${result.tasks.length}`);
  console.log();
  
  // Show tasks
  console.log('Tasks:');
  for (const task of result.tasks) {
    console.log(`  - ${task.name}: ${task.interval_ms}ms interval, priority ${task.priority}`);
  }
  console.log();
  
  // Show assembly
  console.log('Generated Assembly:');
  console.log('-'.repeat(60));
  for (const prog of result.programDetails) {
    console.log(`; === ${prog.name} ===`);
    console.log(prog.assembly);
  }
  console.log('-'.repeat(60));
  
  // Show hex dump of first 64 bytes
  console.log();
  console.log('Bytecode (first 64 bytes):');
  const hexDump = Array.from(result.zplcFile.slice(0, 64))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  console.log(hexDump);
  
  console.log();
  console.log('Test PASSED');
  
} catch (e) {
  console.error('Compilation failed:', e);
  process.exit(1);
}
