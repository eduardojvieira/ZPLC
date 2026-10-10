/**
 * The one on-disk form of a Ladder, FBD or SFC file (LNG-014): two-space JSON, LF line ends and one newline at
 * the end, the form the files of the repository are committed in. Every editor writes through here, so a file
 * that was saved once does not change again until its content does.
 */
export function serializeVisualDocument(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
