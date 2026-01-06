import { compileMultiTaskProject } from './src/compiler/index.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock file system for the compiler
const projectPath = path.resolve('./ide/projects/analog_test');
const zplcPath = path.join(projectPath, 'zplc.json');
const mainPath = path.join(projectPath, 'src/main.st');

console.log(`Compiling project at ${projectPath}`);

const zplcConfig = JSON.parse(fs.readFileSync(zplcPath, 'utf8'));
const mainContent = fs.readFileSync(mainPath, 'utf8');

// Mock files array
const files = [{
    name: 'main',
    content: mainContent,
    language: 'ST' as const
}];

try {
    const result = compileMultiTaskProject(zplcConfig, files);

    console.log('Compilation successful!');
    console.log(`Code Size: ${result.codeSize} bytes`);

    // Hex dump
    const hex = Array.from(result.bytecode)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');

    console.log('\nBinary Hex:');
    console.log(hex);

    // Check for LOAD16 instruction at offset 16 (0x10)
    // We look for address access.

    // Save to disk for upload
    fs.writeFileSync('analog_test.zplc', result.zplcFile);
    console.log('\nSaved to analog_test.zplc');

} catch (e) {
    console.error('Compilation failed:', e);
}
