import useBaseUrl from '@docusaurus/useBaseUrl';
import Paths from './Paths';
import styles from './LandingPage.module.css';
import { keepStandard, useLandingPageContent } from './content';

// The hero: always on the dark material of the application (Commissioning Spine). The promise set large across the page,
// the plain description under it, then the two ways in (build and learn, with equal weight) beside the generated image
// (docs/static/img/generated/README.md).
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
        <h1 className={styles.heroTitle}>{hero.title}</h1>
        <p className={styles.heroLead}>{keepStandard(hero.lead)}</p>
        <div className={styles.heroGrid}>
          <div className={styles.heroBody}>
            <Paths />
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
