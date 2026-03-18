import { parseMpeekResponse } from './src/runtime/peekParser';

const lines = [
  '{"t":"mpeek","results":[',
  '{"addr":8192,"bytes":"1600"},',
  '{"addr":8194,"bytes":"3400"},',
  '{"addr":8196,"bytes":"00"},',
  '{"addr":4096,"bytes":"02"}',
  ']}'
];

const map = parseMpeekResponse(lines);
console.log(map);
