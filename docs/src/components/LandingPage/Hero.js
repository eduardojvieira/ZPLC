import Link from '@docusaurus/Link';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

export default function Hero() {
  const { hero } = useLandingPageContent();

  return (
    <header className={styles.heroSection}>
      <div className={styles.heroBackground}>
        <div className={styles.gridPattern}></div>
        <div className={styles.glowOrb1}></div>
        <div className={styles.glowOrb2}></div>
      </div>

      <div className={styles.heroContent}>
        <div className={styles.heroText}>
          <div className={styles.badge}>
            <span className={styles.badgeIcon}>⚡</span>
            <span>{hero.badge}</span>
          </div>

          <h1 className={styles.heroTitle}>
            {hero.titleLead}
            <br />
            <span className={styles.heroTitleAccent}>{hero.titleAccent}</span>
          </h1>

          <p className={styles.heroSubtitle}>{hero.subtitle}</p>

          <div className={styles.buttons}>
            <Link
              className={`button button--primary button--lg ${styles.heroButton} ${styles.primaryButton}`}
              to={hero.primaryTo}>
              {hero.primaryCta}
              <span className={styles.buttonArrow}>→</span>
            </Link>
            <Link
              className={`button button--secondary button--lg ${styles.heroButton} ${styles.secondaryButton}`}
              to={hero.secondaryTo}>
              {hero.secondaryCta}
            </Link>
          </div>

          <div className={styles.trustedBy}>
            <div className={styles.techLogos}>
              {hero.chips.map((chip) => (
                <span key={chip} className={styles.techLogo}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
