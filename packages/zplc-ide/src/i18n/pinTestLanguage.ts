// Preloaded by bunfig.toml for `bun test`: the system language of a test is English, whatever the machine speaks.
// Bun has no navigator.language of its own today; a version that reads it from the environment is pinned here.
if (typeof navigator !== 'undefined') Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
