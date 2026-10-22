import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import manifest from '@site/static/img/manifest.json';
import styles from './LandingPage.module.css';
import { keepStandard, useLandingPageContent } from './content';

/** The commit that a registered capture was taken from (docs/static/img/manifest.json), short. */
function captureCommit(file) {
  const image = manifest.images.find((entry) => entry.file === file);
  return (image?.commit ?? manifest.commit).slice(0, 7);
}

// The hero: the tagline and the two actions, then a real capture of the application read like a drawing sheet, its regions
// numbered on the picture and named in the list beside it, then the release status.
export default function Hero() {
  const { hero } = useLandingPageContent();
  const logo = useBaseUrl('/img/logo.svg');
  const shot = useBaseUrl(`/img/${hero.shot}`);

  return (
    <header className={styles.hero}>
      <div className={styles.wrap}>
        <div className={styles.heroCopy}>
          <p className={styles.brand}>
            <img src={logo} alt="" width="40" height="40" />
            <span>ZPLC</span>
          </p>
          <h1 className={styles.heroTitle}>{keepStandard(hero.title)}</h1>
          <p className={styles.heroLead}>{keepStandard(hero.lead)}</p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href={hero.downloadHref}>
              {hero.download}
            </Link>
            <Link className={styles.secondaryAction} to={hero.startTo}>
              {hero.start}
            </Link>
          </div>
        </div>

        <figure className={styles.sheet}>
          <div className={styles.plate}>
            <img src={shot} alt={hero.shotAlt} width="1366" height="768" fetchPriority="high" decoding="async" />
            {hero.callouts.map((callout, index) => (
              <span
                key={callout.text}
                className={styles.balloon}
                style={{ '--x': callout.x, '--y': callout.y, '--i': index }}
                aria-hidden="true"
              >
                {index + 1}
              </span>
            ))}
          </div>
          <figcaption className={styles.legend}>
            <ol className={styles.parts}>
              {hero.callouts.map((callout) => (
                <li key={callout.text}>{callout.text}</li>
              ))}
            </ol>
            <p className={styles.provenance}>
              {hero.provenance} <code>{captureCommit(hero.shot)}</code>.
            </p>
          </figcaption>
        </figure>

        <p className={styles.status}>
          <strong className={styles.statusLabel}>{hero.statusLabel}</strong>
          <span>
            {hero.status} <Link to={hero.statusTo}>{hero.statusLink}</Link>
          </span>
        </p>
      </div>
    </header>
  );
}
