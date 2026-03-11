import { compileToBinary } from "./packages/zplc-compiler/src/index.ts";

const source = `
PROGRAM main
  VAR
    foo : INT := 42 {publish};
    bar : REAL {modbus:40001};
    plain : BOOL;
  END_VAR

  foo := 10;
END_PROGRAM
`;

try {
    const result = compileToBinary(source, { generateDebugMap: true });
    console.log("Compilation successful!");
    console.log("Debug Map Variables:");
    if (result.debugMap) {
        const vars = result.debugMap.pou["main"].vars;
        for (const [name, info] of Object.entries(vars)) {
            console.log(`- ${name}: tags=${JSON.stringify(info.tags)}`);
        }
    } else {
        console.log("No debug map generated.");
    }
} catch (e) {
    console.error("Compilation failed:", e);
}
