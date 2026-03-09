declare const __ZPLC_REPO_VERSION__: string | undefined;

const fallbackVersion = "dev";

export const ZPLC_REPO_VERSION =
  typeof __ZPLC_REPO_VERSION__ === "string" && __ZPLC_REPO_VERSION__.trim().length > 0
    ? __ZPLC_REPO_VERSION__
    : fallbackVersion;
