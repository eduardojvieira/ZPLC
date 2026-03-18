const CHECKLIST = [
  'Install or launch the desktop IDE artifact',
  'Open a sample project',
  'Compile successfully',
  'Run simulation and observe expected runtime state',
  'Deploy to a target or simulated runtime',
  'Set and hit a breakpoint',
  'Step and continue execution',
  'Inspect watch values',
  'Force a value and confirm the result',
  'Save evidence artifacts and notes',
] as const;

function main(): void {
  const platform = process.argv[2] ?? process.platform;

  console.log(`Desktop smoke workflow for: ${platform}`);
  console.log('Use this script as the canonical human-run checklist:');

  CHECKLIST.forEach((step, index) => {
    console.log(`${index + 1}. ${step}`);
  });
}

main();
