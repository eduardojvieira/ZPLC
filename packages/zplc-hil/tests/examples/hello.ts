import { run, HILTestCase } from '../src/index';

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
  // Usage: bun run hello.ts <port>
  const port = process.argv[2] || '/dev/tty.usbmodem1234';
  
  try {
    const result = await run(test, { port });
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${result.duration}ms`);
    if (result.status === 'pass') {
      console.log('✅ PASS');
    } else {
      console.log('❌ FAIL');
      console.log(result.error);
    }
  } catch (err) {
    console.error('Infrastructure Error:', err);
  }
}

main();
