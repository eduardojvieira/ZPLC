import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// The copyright of the footer names the release in every language (REL-033). The English line of docusaurus.config.js
// carries the release tag; a translated line (docs/i18n/es/docusaurus-theme-classic/footer.json) is a fixed string, so the
// tag is added here when the line does not already name it.
export default function FooterCopyright({ copyright }) {
  const { releaseTag } = useDocusaurusContext().siteConfig.customFields;
  const line = copyright.includes(releaseTag) ? copyright : `${copyright} ZPLC ${releaseTag}.`;
  // the line is the site's own configuration and translation, not user input
  return <div className="footer__copyright" dangerouslySetInnerHTML={{ __html: line }} />;
}
