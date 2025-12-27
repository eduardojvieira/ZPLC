import { transpileLDToST } from './src/transpiler/ldToST';
import { compileST } from './src/compiler';
import { assemble } from './src/assembler';
import motorLD from './src/examples/motor_control.ld.json';

console.log('=== Motor Control LD Transpile ===\n');
const ldResult = transpileLDToST(motorLD as any);
console.log('Success:', ldResult.success);
if (ldResult.errors.length > 0) {
    console.log('Errors:', ldResult.errors);
}
console.log('\nTranspiled ST:');
console.log(ldResult.source);

if (ldResult.success) {
    console.log('\n=== ST Compile ===');
    try {
        const asm = compileST(ldResult.source);
        console.log('✅ Assembly generated successfully');
        console.log('\n--- Assembly Output ---');
        console.log(asm);
        
        console.log('\n=== Assemble ===');
        const bytecode = assemble(asm);
        console.log('✅ Bytecode:', bytecode.length, 'bytes');
    } catch (e: any) {
        console.log('❌ Compile error:', e.message);
        console.log(e.stack);
    }
}
