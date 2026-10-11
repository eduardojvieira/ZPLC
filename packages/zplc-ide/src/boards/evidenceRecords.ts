/**
 * The evidence records that the board manifest references, by the path the manifest uses (HIL-009, IO-015).
 *
 * Studio cannot read repository files at run time, so a record is bundled by importing its JSON here. A reference in
 * firmware/app/boards/boards.json that is not a key of this map leaves its board at cross-build (a test pins that the
 * two agree, so a reference cannot be added without bundling its record). No board has a record yet.
 */
export const EVIDENCE_RECORDS: Readonly<Record<string, unknown>> = {};
