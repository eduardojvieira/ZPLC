/**
 * Test Pico Blinky Project Compilation
 * 
 * Compiles the pico_blinky project for Raspberry Pi Pico with proper
 * multi-task format required by the Zephyr scheduler.
 * 
 * Run with: bun run test_pico_blinky.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { compileMultiTaskProject } from './src/compiler/index.ts';
import type { ProgramSource } from './src/compiler/index.ts';
import type { ZPLCProjectConfig } from './src/types/index.ts';
import { hexDump, disassemble } from './src/assembler/index.ts';

// Load project configuration
const projectDir = join(import.meta.dir, 'projects/pico_blinky');
const configPath = join(projectDir, 'zplc.json');
const config: ZPLCProjectConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

console.log('='.repeat(60));
console.log('ZPLC Pico Blinky Project Compiler');
console.log('='.repeat(60));
console.log(`\nProject: ${config.name} v${config.version}`);
console.log(`Target: ${config.target?.board ?? 'generic'}`);
console.log(`Tasks: ${config.tasks.length}`);

// Load program sources
const sources: ProgramSource[] = [];

for (const task of config.tasks) {
    for (const progName of task.programs) {
        // Find the source file - handle both with and without .st extension
        const baseName = progName.replace(/\.st$/, '');
        const stPath = join(projectDir, 'src', `${baseName}.st`);
        try {
            const content = readFileSync(stPath, 'utf-8');
            sources.push({
                name: baseName,
                content,
                language: 'ST'
            });
            console.log(`\nLoaded: src/${baseName}.st`);
        } catch (e) {
            console.error(`Error loading ${stPath}: ${(e as Error).message}`);
            process.exit(1);
        }
    }
}

console.log('\n' + '-'.repeat(60));
console.log('Compiling...');
console.log('-'.repeat(60));

try {
    const result = compileMultiTaskProject(config, sources);

    console.log('\n✓ Compilation successful!');
    console.log(`\n  Total code size: ${result.codeSize} bytes`);
    console.log(`  .zplc file size: ${result.zplcFile.length} bytes`);
    console.log(`  Tasks generated: ${result.tasks.length}`);

    console.log('\n' + '-'.repeat(60));
    console.log('Task Definitions');
    console.log('-'.repeat(60));

    for (const task of result.tasks) {
        console.log(`\n  Task ID ${task.id}:`);
        console.log(`    Type:       ${task.type === 0 ? 'CYCLIC' : task.type === 1 ? 'EVENT' : 'INIT'}`);
        console.log(`    Priority:   ${task.priority}`);
        console.log(`    Interval:   ${task.intervalUs} µs (${task.intervalUs / 1000} ms)`);
        console.log(`    Entry:      0x${task.entryPoint.toString(16).padStart(4, '0')}`);
        console.log(`    Stack:      ${task.stackSize}`);
    }

    console.log('\n' + '-'.repeat(60));
    console.log('Program Details');
    console.log('-'.repeat(60));

    for (const prog of result.programDetails) {
        console.log(`\n  ${prog.name}:`);
        console.log(`    Entry point: 0x${prog.entryPoint.toString(16).padStart(4, '0')}`);
        console.log(`    Size:        ${prog.size} bytes`);
    }

    console.log('\n' + '-'.repeat(60));
    console.log('Bytecode Hex Dump');
    console.log('-'.repeat(60));
    console.log(hexDump(result.bytecode));

    console.log('\n' + '-'.repeat(60));
    console.log('Disassembly');
    console.log('-'.repeat(60));
    console.log(disassemble(result.bytecode));

    // Write output files
    mkdirSync(join(projectDir, 'build'), { recursive: true });
    
    const outputPath = join(projectDir, 'build', 'main.zplc');
    writeFileSync(outputPath, result.zplcFile);
    console.log(`\n✓ Wrote: ${outputPath} (${result.zplcFile.length} bytes)`);

    // Also save the assembly for debugging
    const asmPath = join(projectDir, 'build', 'main.asm');
    const assemblyContent = result.programDetails.map(p => `; === ${p.name} ===\n${p.assembly}`).join('\n\n');
    writeFileSync(asmPath, assemblyContent);
    console.log(`✓ Wrote: ${asmPath}`);

    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS - Ready to upload to Pico!');
    console.log('='.repeat(60));

} catch (e) {
    console.error('\n✗ Compilation failed:');
    console.error(`  ${(e as Error).message}`);
    if (e instanceof Error && e.stack) {
        console.error(e.stack);
    }
    process.exit(1);
}
