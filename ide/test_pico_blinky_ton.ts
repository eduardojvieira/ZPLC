/**
 * Test: Pico Blinky variants
 * 
 * Compiles all three versions of pico_blinky_ton project:
 * 1. main.st - Simple counter-based toggle
 * 2. main_blink.st - Using BLINK function block
 * 3. main_ton.st - Using TON timer with manual reset
 */

import { compileMultiTaskProject } from './src/compiler';
import type { ProgramSource, ZPLCProjectConfig } from './src/compiler';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const projectPath = join(__dirname, 'projects/pico_blinky_ton');

// Load project config
const configPath = join(projectPath, 'zplc.json');
const projectConfig: ZPLCProjectConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

// Test each variant
const variants = ['main.st', 'main_blink.st', 'main_ton.st'];

console.log('='.repeat(70));
console.log('PICO BLINKY - All Variants Compilation Test');
console.log('='.repeat(70));
console.log();

for (const variant of variants) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${variant}`);
  console.log('='.repeat(70));
  
  try {
    // Load program source
    const mainPath = join(projectPath, 'src', variant);
    const mainContent = readFileSync(mainPath, 'utf-8');
    
    // Update config for this variant
    const config = { ...projectConfig };
    config.tasks = [{
      name: 'MainTask',
      trigger: 'cyclic' as const,
      interval: 10,
      priority: 1,
      programs: [variant]
    }];
    
    const programSources: ProgramSource[] = [
      { name: variant.replace('.st', ''), content: mainContent, language: 'ST' }
    ];
    
    const result = compileMultiTaskProject(config, programSources);
    
    console.log(`\n✅ ${variant} - Compilation successful!`);
    console.log(`   Total: ${result.zplcFile.length} bytes, Code: ${result.codeSize} bytes`);
    
    // Show assembly (shortened)
    console.log('\nAssembly (first 50 lines):');
    console.log('-'.repeat(50));
    const asmLines = result.programDetails[0].assembly.split('\n').slice(0, 50);
    console.log(asmLines.join('\n'));
    if (result.programDetails[0].assembly.split('\n').length > 50) {
      console.log('... (truncated)');
    }
    console.log('-'.repeat(50));
    
    // Save bytecode for upload
    const outputPath = join(projectPath, `build/${variant.replace('.st', '.zplc')}`);
    writeFileSync(outputPath, result.zplcFile);
    console.log(`\nSaved: ${outputPath}`);
    
    // Also save as hex for serial upload
    const hexData = Array.from(result.zplcFile)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const hexPath = join(projectPath, `build/${variant.replace('.st', '.hex')}`);
    writeFileSync(hexPath, hexData);
    console.log(`Saved: ${hexPath}`);
    
  } catch (e) {
    console.error(`\n❌ ${variant} - Compilation FAILED:`, e);
  }
}

console.log('\n' + '='.repeat(70));
console.log('All variants tested!');
console.log('='.repeat(70));
