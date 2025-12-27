import { compileST } from './src/compiler';
import { assemble } from './src/assembler';

const EXAMPLE_ST = `(* Blinky Program - Structured Text *)
PROGRAM Blinky

VAR
    BlinkTimer : TON;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* Timer with 500ms interval *)
BlinkTimer(IN := TRUE, PT := T#500ms);

IF BlinkTimer.Q THEN
    LedState := NOT LedState;
    BlinkTimer(IN := FALSE, PT := T#500ms);
END_IF;

(* Output to LED *)
LED_Output := LedState;

END_PROGRAM`;

console.log('=== Testing ST Example ===\n');
console.log('Source:');
console.log(EXAMPLE_ST);
console.log('\n=== Compile ===');

try {
    const asm = compileST(EXAMPLE_ST);
    console.log('✅ Compilation successful!\n');
    console.log('Assembly output:');
    console.log(asm.substring(0, 1500) + '...\n');
    
    const bytecode = assemble(asm);
    console.log(`✅ Assembled: ${bytecode.length} bytes`);
} catch (e: any) {
    console.log('❌ Compilation error:', e.message);
}
