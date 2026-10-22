import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './LandingPage.module.css';
import { keepStandard, useLandingPageContent } from './content';

// The hero: always on the dark material of the application (Commissioning Spine), the tagline set large across the page,
// the action tagline and the two actions beside the generated image (docs/static/img/generated/README.md), and the release status with an
// amber status lamp.
export default function Hero() {
  const { hero } = useLandingPageContent();
  const logo = useBaseUrl('/img/logo.svg');
  const art = useBaseUrl('/img/generated/hero-rung-to-terminal.avif');
  const artSmall = useBaseUrl('/img/generated/hero-rung-to-terminal-720.avif');
  const artMedium = useBaseUrl('/img/generated/hero-rung-to-terminal-1080.avif');

  return (
    <header className={`${styles.hero} zplc-spine`}>
      <div className={styles.wrap}>
        <p className={styles.brand}>
          <img src={logo} alt="" width="36" height="36" />
          <span>ZPLC</span>
        </p>
        <h1 className={styles.heroTitle}>{keepStandard(hero.title)}</h1>
        <div className={styles.heroGrid}>
          <div className={styles.heroBody}>
            <p className={styles.heroLead}>{keepStandard(hero.lead)}</p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href={hero.downloadHref}>
                {hero.download}
              </Link>
              <Link className={styles.secondaryAction} to={hero.startTo}>
                {hero.start}
              </Link>
            </div>
            <p className={styles.status}>
              <span className={styles.lamp} aria-hidden="true" />
              <strong className={styles.statusLabel}>{hero.statusLabel}</strong>
              <span className={styles.statusText}>
                {hero.status} <Link to={hero.statusTo}>{hero.statusLink}</Link>
              </span>
            </p>
          </div>
          <img
            className={styles.heroArt}
            src={art}
            srcSet={`${artSmall} 720w, ${artMedium} 1080w, ${art} 1376w`}
            sizes="(max-width: 996px) calc(100vw - 2rem), 58vw"
            alt={hero.artAlt}
            width="1376"
            height="768"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </div>
    </header>
  );
}
