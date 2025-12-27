import { transpileFBDToST } from './src/transpiler/fbdToST';
import { compileST } from './src/compiler';
import { assemble } from './src/assembler';
import blinkyFBD from './src/examples/blinky.fbd.json';

console.log('=== FBD Transpile ===');
const fbdResult = transpileFBDToST(blinkyFBD as any);
console.log('Success:', fbdResult.success);
console.log('Errors:', fbdResult.errors);
console.log('\nTranspiled ST:');
console.log(fbdResult.source);

if (fbdResult.success) {
    console.log('\n=== ST Compile ===');
    try {
        const asm = compileST(fbdResult.source);
        console.log('Assembly generated');
        console.log(asm);
        
        console.log('\n=== Assemble ===');
        const bytecode = assemble(asm);
        console.log('Bytecode:', bytecode.length, 'bytes');
    } catch (e: any) {
        console.log('Compile error:', e.message);
    }
}
