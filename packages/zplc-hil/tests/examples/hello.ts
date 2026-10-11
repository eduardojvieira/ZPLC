import { openSerialLink, run } from '../../src/index';
import type { HILTestCase } from '../../src/index';

const test: HILTestCase = {
  id: 'examples.hello',
  name: 'Hello HIL: Arithmetic Test',
  category: 'opcode',
  language: 'ST',
  source: `
    PROGRAM Main
    VAR
      a : INT := 10;
      b : INT := 5;
      res : INT;
    END_VAR
    res := a + b;
    END_PROGRAM
  `,
  debugMode: 'verbose',
  assertions: [
    {
      type: 'pattern',
      pattern: /\{"t":"opcode","op":"ADD",.*"tos":15\}/
    }
  ]
};

async function main() {
  console.log(`Running test: ${test.name}`);
  // Usage: bun run hello.ts [port]. Without a port, ZPLC_SERIAL_PORT, or the USB identifiers of the board, name it.
  // A person runs this at the bench: it deploys to a board.
  
  try {
    const link = await openSerialLink({ ...(process.argv[2] ? { port: process.argv[2] } : {}), board: 'rpi_pico' });
    const result = await run(test, link).finally(() => link.close());
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.duration}ms`);
    if (result.status === 'pass') {
      console.log('✅ PASS');
    } else {
      console.log('❌ FAIL');
      console.log(result.error);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Infrastructure Error:', err);
    process.exitCode = 1;
  }
}

main();
