import { FUNCTION_CATEGORIES, getAllFBNames, getAllFnNames } from '@zplc/compiler';
import { stdFunctions } from './stdFunctions';

export interface BlockCategoryDefinition {
  name: string;
  blocks: string[];
}

const CUSTOM_COMMUNICATION_BLOCKS = [
  'COMM_CONNECT',
  'COMM_PUBLISH',
  'COMM_SUBSCRIBE',
  'COMM_MODBUS',
  'MB_COIL',
  'MB_DISCRETE_INPUT',
  'MB_INPUT_REGISTER',
  'MB_HOLDING_REGISTER',
] as const;

const CATEGORY_RULES: Array<{ name: string; blocks: string[] }> = [
  { name: 'Timers', blocks: ['TON', 'TOF', 'TP'] },
  { name: 'Counters', blocks: ['CTU', 'CTD', 'CTUD'] },
  { name: 'Edge Detection', blocks: ['R_TRIG', 'F_TRIG'] },
  { name: 'Bistables', blocks: ['SR', 'RS'] },
  { name: 'Generators', blocks: ['BLINK', 'PWM', 'PULSE'] },
  { name: 'Process Control', blocks: ['PID_Compact', 'HYSTERESIS', 'DEADBAND', 'LAG_FILTER', 'RAMP_REAL', 'INTEGRAL', 'DERIVATIVE'] },
  { name: 'System', blocks: ['FIFO', 'LIFO', 'UPTIME', 'CYCLE_TIME', 'WATCHDOG_RESET'] },
  { name: 'Communication', blocks: [...CUSTOM_COMMUNICATION_BLOCKS] },
  { name: 'Logic Gates', blocks: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'] },
  { name: 'Comparison', blocks: ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'] },
  {
    name: 'Math',
    blocks: ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'ABS', 'ABSF', 'SQRT', 'EXPT', 'LN', 'LOG', 'EXP', 'NEG', 'NEGF', 'TRUNC', 'ROUND'],
  },
  { name: 'Trigonometry', blocks: ['SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2'] },
  { name: 'Selection', blocks: ['MAX', 'MIN', 'LIMIT', 'SEL', 'MUX', 'NORM_X', 'SCALE_X'] },
  {
    name: 'Bitwise',
    blocks: ['SHL', 'SHR', 'ROL', 'ROR', 'AND_WORD', 'OR_WORD', 'XOR_WORD', 'NOT_WORD', 'AND_DWORD', 'OR_DWORD', 'XOR_DWORD', 'NOT_DWORD'],
  },
  { name: 'Strings', blocks: ['LEN', 'CONCAT', 'LEFT', 'RIGHT', 'MID', 'FIND', 'INSERT', 'DELETE', 'REPLACE', 'STRCMP'] },
];

function collectKnownBlocks(): Set<string> {
  return new Set([
    ...getAllFBNames(),
    ...getAllFnNames(),
    ...CUSTOM_COMMUNICATION_BLOCKS,
    'AND',
    'OR',
    'NOT',
    'XOR',
    'EQ',
    'NE',
    'LT',
    'LE',
    'GT',
    'GE',
    'ADD',
    'SUB',
    'MUL',
    'DIV',
  ]);
}

export function getBlockCategories(): BlockCategoryDefinition[] {
  const known = collectKnownBlocks();
  const assigned = new Set<string>();

  const categories = CATEGORY_RULES.map((category) => {
    const blocks = category.blocks.filter((block) => known.has(block));
    blocks.forEach((block) => assigned.add(block));
    return {
      name: category.name,
      blocks,
    };
  }).filter((category) => category.blocks.length > 0);

  // the other functions go by the category of the compiler's table (LNG-030), the 240 conversions in one group by source type
  const byName = new Map(categories.map((category) => [category.name, category] as const));
  const conversions: string[] = [];
  for (const record of stdFunctions().values()) {
    if (assigned.has(record.name) || !known.has(record.name)) continue;
    assigned.add(record.name);
    if (record.category === 'conversion') {
      conversions.push(record.name); // the table builds them by source type, in CONVERSION_TYPES order
      continue;
    }
    const name = FUNCTION_CATEGORIES.find((category) => category.id === record.category)?.en ?? 'Other';
    const group = byName.get(name) ?? { name, blocks: [] };
    if (!byName.has(name)) {
      byName.set(name, group);
      categories.push(group);
    }
    group.blocks.push(record.name);
  }
  if (conversions.length > 0) categories.push({ name: 'Conversions', blocks: conversions });

  const uncategorized = Array.from(known)
    .filter((block) => !assigned.has(block))
    .sort();
  if (uncategorized.length > 0) {
    categories.push({
      name: 'Other',
      blocks: uncategorized,
    });
  }

  return categories;
}

export function getFunctionBlockNamesForVisualEditors(): string[] {
  const names = new Set<string>([...getAllFBNames(), ...CUSTOM_COMMUNICATION_BLOCKS]);
  return Array.from(names).sort();
}
