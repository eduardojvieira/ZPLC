import { compileToBinary } from "./packages/zplc-compiler/src/index.ts";

const source = `
PROGRAM main
  VAR
    foo : INT := 42 {publish};
    bar : REAL {modbus:40001};
  END_VAR

  foo := 10;
END_PROGRAM
`;

try {
    const result = compileToBinary(source);
    console.log("Compilation successful!");
    
    // Check if the TAGS segment is present (Segment type 0x30)
    const view = new DataView(result.zplcFile.buffer);
    const magic = view.getUint32(0, true);
    if (magic !== 0x434C505A) {
        console.error("Invalid magic:", magic.toString(16));
    }
    
    const segmentCount = view.getUint16(26, true);
    console.log("Segment count:", segmentCount);
    
    let offset = 32; // Skip header
    let foundTags = false;
    for (let i = 0; i < segmentCount; i++) {
        const type = view.getUint16(offset, true);
        const size = view.getUint32(offset + 4, true);
        console.log(`Segment ${i}: Type=0x${type.toString(16)}, Size=${size}`);
        if (type === 0x30) {
            foundTags = true;
            console.log("SUCCESS: TAGS segment found!");
        }
        offset += 8;
    }
    
    if (!foundTags) {
        console.error("ERROR: TAGS segment NOT found!");
        console.log("Assembly output:\n", result.assembly);
    }
} catch (e) {
    console.error("Compilation failed:", e);
}
