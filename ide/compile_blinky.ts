/**
 * Compile blinky.ld.json to bytecode and display the result.
 * 
 * Run with: bun run compile_blinky.ts
 */
import { compileProject } from './src/compiler/index.ts';
import { readFileSync, writeFileSync } from 'fs';

// Load blinky.ld.json
const ldJson = readFileSync('./src/examples/blinky.ld.json', 'utf-8');

console.log('=== Compiling blinky.ld.json ===\n');

try {
    // Compile LD -> ST -> ASM -> Bytecode
    const result = compileProject(ldJson, 'LD');

    console.log('=== Intermediate ST Code ===');
    console.log(result.intermediateSTSource);
    
    console.log('\n=== Generated Assembly ===');
    console.log(result.assembly);
    
    console.log('\n=== Compilation Result ===');
    console.log(`Bytecode size: ${result.bytecode.length} bytes`);
    console.log(`Entry point: 0x${result.entryPoint.toString(16)}`);
    console.log(`Code size: ${result.codeSize} bytes`);
    
    // Write bytecode to file
    writeFileSync('/tmp/blinky.bin', Buffer.from(result.bytecode));
    console.log('\nBytecode written to /tmp/blinky.bin');
    
    // Write ZPLC file (with header)
    writeFileSync('/tmp/blinky.zplc', Buffer.from(result.zplcFile));
    console.log('ZPLC file written to /tmp/blinky.zplc');
    
    // Show hex dump of bytecode
    console.log('\n=== Bytecode Hex Dump ===');
    for (let i = 0; i < result.bytecode.length; i += 16) {
        const slice = Array.from(result.bytecode.slice(i, i + 16));
        const hexRow = slice.map(b => b.toString(16).padStart(2, '0')).join(' ');
        const addr = i.toString(16).padStart(4, '0');
        console.log(`${addr}: ${hexRow}`);
    }
    
} catch (e) {
    console.error('Compilation failed:', (e as Error).message);
    process.exit(1);
}
