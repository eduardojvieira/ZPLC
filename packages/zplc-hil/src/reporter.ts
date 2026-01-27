import { TestResult } from './runner';
import * as fs from 'fs';

export class JUnitReporter {
  generate(results: TestResult[]): string {
    const suites: Record<string, TestResult[]> = {};
    let totalTests = 0;
    let totalFailures = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    let totalTime = 0;

    // Group by suite (first part of testId)
    for (const result of results) {
      const suiteName = result.testId.split('.')[0] || 'default';
      if (!suites[suiteName]) {
        suites[suiteName] = [];
      }
      suites[suiteName].push(result);
      
      totalTests++;
      totalTime += result.duration;
      if (result.status === 'fail') totalFailures++;
      if (result.status === 'error') totalErrors++;
      if (result.status === 'skip') totalSkipped++;
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites time="${totalTime / 1000}" tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}">\n`;

    for (const [suiteName, suiteResults] of Object.entries(suites)) {
      const suiteTime = suiteResults.reduce((acc, r) => acc + r.duration, 0);
      const suiteFailures = suiteResults.filter(r => r.status === 'fail').length;
      const suiteErrors = suiteResults.filter(r => r.status === 'error').length;
      
      xml += `  <testsuite name="${suiteName}" timestamp="${new Date().toISOString()}" time="${suiteTime / 1000}" tests="${suiteResults.length}" failures="${suiteFailures}" errors="${suiteErrors}">\n`;
      
      for (const result of suiteResults) {
        xml += `    <testcase name="${result.testId}" classname="${suiteName}" time="${result.duration / 1000}">\n`;
        
        if (result.status === 'fail') {
          xml += `      <failure message="${escape(result.error || 'Failed')}">${escape(JSON.stringify(result.failedAssertion))}</failure>\n`;
        } else if (result.status === 'error') {
          xml += `      <error message="${escape(result.error || 'Error')}"/>\n`;
        } else if (result.status === 'skip') {
          xml += `      <skipped/>\n`;
        }
        
        xml += `    </testcase>\n`;
      }
      
      xml += `  </testsuite>\n`;
    }

    xml += `</testsuites>\n`;
    return xml;
  }

  write(results: TestResult[], path: string): void {
    const xml = this.generate(results);
    fs.writeFileSync(path, xml);
  }
}

function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
