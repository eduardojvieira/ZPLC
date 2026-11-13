// Types of content.js, for the tests under tools/docs that import it: only the parts they read are typed.
export interface DownloadPageText {
  systems: Record<string, string>;
  formats: Record<string, string>;
  [key: string]: unknown;
}

export interface LandingPageContent {
  download: DownloadPageText;
  paths: { build: { to?: string; href?: string; [key: string]: unknown }; [key: string]: unknown };
  [key: string]: unknown;
}

export const releasesUrl: string;
export function getLandingPageContent(locale: string): LandingPageContent;
export function useLandingPageContent(): LandingPageContent;
