// Reading source text that a formatter laid out (VF-017). The scanners that read product source with a regular
// expression (the titles of tests, the usage text of the CLI, the keys of a scenario) call this first.

/** `'a ' +\n 'b'` read as `'a b'`: a formatter or the line wrapper cuts a long string at a space, the string stays one. */
export const flattenConcatenations = (text: string): string => text.replace(/(['"`])\s*\+\s*\1/g, '');
