#!/usr/bin/env bun
import { parseArgs } from "util";
import { compileToBinary, compileSingleFileWithTask, compileST } from "@zplc/compiler";
import { transpileLDToST } from '../transpiler/ldToST';
import { transpileFBDToST } from '../transpiler/fbdToST';
import { transpileSFCToST } from '../transpiler/sfcToST';
import { transpileILToST } from '../compiler/il/ilToST';
import { parseIL } from '../compiler/il/parser';
import * as fs from "fs";
import * as path from "path";

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      json: { type: "boolean", short: "j" },
      port: { type: "string", short: "p" },
      baud: { type: "string", short: "b" },
      output: { type: "string", short: "o" },
      language: { type: "string", short: "l", default: "ST" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    return;
  }

  if (values.version) {
    console.log("zplc-cli v0.1.0");
    return;
  }

  const command = positionals[0];

  try {
    switch (command) {
      case "compile":
        await handleCompile(positionals[1], values);
        break;
      case "upload":
        console.error("Upload not implemented in this minimal CLI version");
        process.exit(1);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
ZPLC CLI - Industrial PLC Development Toolchain

Usage:
  zplc-cli <command> [arguments] [options]

Commands:
  compile <file>    Compile source code to binary (.zplc)
  upload <file>     Upload bytecode to device

Options:
  -h, --help        Show this help
  -v, --version     Show version
  -j, --json        Output result as JSON
  -o, --output <f>  Output file path
  -l, --lang <l>    Source language (ST, LD, FBD, SFC)
`);
}

async function handleCompile(file: string, options: any) {
  if (!file) throw new Error("No input file specified");
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  
  const source = fs.readFileSync(file, "utf8");
  let stCode = source;
  const ext = path.extname(file).toLowerCase();
  
  // Determine language if not explicit
  let lang = options.language;
  
  // If default ST is used, try to auto-detect from extension
  if (lang === "ST") {
      if (ext === '.json') {
           // Try to detect JSON content type (LD, FBD, SFC)
           try {
               const json = JSON.parse(source);
               if (json.type === 'ladder' || json.rungs) lang = 'LD';
               else if (json.type === 'fbd' || json.blocks) lang = 'FBD';
               else if (json.type === 'sfc' || json.steps) lang = 'SFC';
           } catch (e) { /* ignore */ }
      } else if (ext === '.il') {
          lang = 'IL';
      }
  }
  
  console.log(`Detected language: ${lang} for extension ${ext}`);

  // Transpile if needed
  if (lang === 'LD') {
      const json = JSON.parse(source);
      const result = transpileLDToST(json);
      if (!result.success) throw new Error(`LD Transpilation failed: ${result.errors.join(', ')}`);
      stCode = result.source;
      console.log("--- Generated ST (LD) ---");
      console.log(stCode);
  } else if (lang === 'FBD') {
      const json = JSON.parse(source);
      const result = transpileFBDToST(json);
      if (!result.success) throw new Error(`FBD Transpilation failed: ${result.errors.join(', ')}`);
      stCode = result.source;
      console.log("--- Generated ST (FBD) ---");
      console.log(stCode);
  } else if (lang === 'SFC') {
      const json = JSON.parse(source);
      const result = transpileSFCToST(json);
      if (!result.success) throw new Error(`SFC Transpilation failed: ${result.errors.join(', ')}`);
      stCode = result.source;
      console.log("--- Generated ST (SFC) ---");
      console.log(stCode);
  } else if (lang === 'IL') {
      try {
          const ast = parseIL(source);
          const result = transpileILToST(ast);
          if (!result.success) throw new Error(`IL Compilation failed: ${result.errors.join(', ')}`);
          stCode = result.source;
          
          // DEBUG
          console.log("--- Generated ST Code ---");
          console.log(stCode);
          console.log("-----------------------");
      } catch (e) {
          throw new Error(`IL Parsing failed: ${(e as Error).message}`);
      }
  }
  
  if (options.output) {
    const isRaw = options.output.endsWith('.bin');
    let result;
    
    if (isRaw) {
        result = compileToBinary(stCode);
    } else {
        result = compileSingleFileWithTask(stCode, {
            taskName: 'Main',
            intervalMs: 50,
            priority: 3
        });
    }

    fs.writeFileSync(options.output, Buffer.from(isRaw ? result.bytecode : result.zplcFile));
    if (!options.json) {
        console.log(`Successfully compiled ${file}`);
        console.log(`Output: ${options.output} (${isRaw ? 'raw bytecode' : 'full zplc file'})`);
        console.log(`Bytecode size: ${result.codeSize} bytes`);
    } else {
        console.log(JSON.stringify({
            success: true,
            output: options.output,
            codeSize: result.codeSize
        }));
    }
  } else {
    // If no output, just print assembly to stdout
    const assembly = compileST(source);
    console.log(assembly);
  }
}
main();
