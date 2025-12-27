import { transpileLDToST } from './src/transpiler/ldToST';
import { transpileFBDToST } from './src/transpiler/fbdToST';
import { transpileSFCToST } from './src/transpiler/sfcToST';
import { compileST } from './src/compiler';
import { assemble } from './src/assembler';
import blinkyLD from './src/examples/blinky.ld.json';
import blinkyFBD from './src/examples/blinky.fbd.json';
import blinkySFC from './src/examples/blinky.sfc.json';
import { readFileSync } from 'fs';

console.log('='.repeat(60));
console.log('Testing Blinky Examples - Full Pipeline');
console.log('='.repeat(60));

// Test ST (direct compile)
console.log('\n--- blinky.st ---');
try {
    const stSource = readFileSync('./src/examples/blinky.st', 'utf-8');
    const stAsm = compileST(stSource);
    const stBytecode = assemble(stAsm);
    console.log(`✅ ST: ${stBytecode.length} bytes`);
} catch (e: any) {
    console.log(`❌ ST Error: ${e.message}`);
}

// Test LD (transpile -> compile)
console.log('\n--- blinky.ld.json ---');
try {
    const ldResult = transpileLDToST(blinkyLD as any);
    if (!ldResult.success) {
        console.log(`❌ LD Transpile Error: ${ldResult.errors.join(', ')}`);
    } else {
        console.log('Transpiled ST:');
        console.log(ldResult.source);
        const ldAsm = compileST(ldResult.source);
        const ldBytecode = assemble(ldAsm);
        console.log(`\n✅ LD: ${ldBytecode.length} bytes`);
    }
} catch (e: any) {
    console.log(`❌ LD Error: ${e.message}`);
}

// Test FBD (transpile -> compile)
console.log('\n--- blinky.fbd.json ---');
try {
    const fbdResult = transpileFBDToST(blinkyFBD as any);
    if (!fbdResult.success) {
        console.log(`❌ FBD Transpile Error: ${fbdResult.errors.join(', ')}`);
    } else {
        console.log('Transpiled ST:');
        console.log(fbdResult.source);
        const fbdAsm = compileST(fbdResult.source);
        const fbdBytecode = assemble(fbdAsm);
        console.log(`\n✅ FBD: ${fbdBytecode.length} bytes`);
    }
} catch (e: any) {
    console.log(`❌ FBD Error: ${e.message}`);
}

// Test SFC (transpile -> compile)
console.log('\n--- blinky.sfc.json ---');
try {
    const sfcResult = transpileSFCToST(blinkySFC as any);
    if (!sfcResult.success) {
        console.log(`❌ SFC Transpile Error: ${sfcResult.errors.join(', ')}`);
    } else {
        console.log('Transpiled ST:');
        console.log(sfcResult.source);
        const sfcAsm = compileST(sfcResult.source);
        const sfcBytecode = assemble(sfcAsm);
        console.log(`\n✅ SFC: ${sfcBytecode.length} bytes`);
    }
} catch (e: any) {
    console.log(`❌ SFC Error: ${e.message}`);
}

console.log('\n' + '='.repeat(60));
console.log('Done!');
