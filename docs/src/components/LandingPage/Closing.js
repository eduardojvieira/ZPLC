import Link from '@docusaurus/Link';
import styles from './LandingPage.module.css';
import { useLandingPageContent, withCode } from './content';

// The close of the page: what ZPLC is not, on an amber warning label, then how to get it and where its source lives.
export default function Closing() {
  const { limits, get, hero } = useLandingPageContent();

  return (
    <section className={styles.section} aria-labelledby="limits-title">
      <div className={styles.wrap}>
        <div className={styles.label}>
          <h2 id="limits-title" className={styles.labelTitle}>
            <span className={styles.lamp} aria-hidden="true" />
            {limits.title}
          </h2>
          <ul className={styles.labelList}>
            {limits.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link to={limits.to} className={styles.labelLink}>
            {limits.link}
          </Link>
        </div>

        <div className={styles.getGrid}>
          <div>
            <h2 className={styles.sectionTitle}>{get.title}</h2>
            <p className={styles.sectionLead}>{withCode(get.lead)}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href={hero.downloadHref}>
                {get.download}
              </Link>
              <Link className={styles.secondaryAction} to={get.installTo}>
                {get.install}
              </Link>
            </div>
          </div>
          <dl className={styles.systems}>
            {get.systems.map((system) => (
              <div key={system.name}>
                <dt>{system.name}</dt>
                <dd>{withCode(system.text)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={styles.source}>
          <h3 className={styles.subTitle}>{get.sourceTitle}</h3>
          <p>{get.source}</p>
          <p className={styles.links}>
            {get.sourceLinks.map((link) =>
              link.href ? (
                <Link key={link.label} href={link.href}>
                  {link.label}
                </Link>
              ) : (
                <Link key={link.label} to={link.to}>
                  {link.label}
                </Link>
              ),
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
