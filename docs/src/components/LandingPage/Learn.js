import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Crop from './Crop';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

// Learn, the second way in, with the weight of the first: the facts of the course beside a capture of a lesson, the course
// drawn as a sequential function chart (each module a step, each level a branch of steps), and the four simulated plants. It
// sits on the band material so that it reads as its own part of the page.
export default function Learn() {
  const { learn } = useLandingPageContent();
  const shot = useBaseUrl(`/img/${learn.shot}`);
  const shotDark = useBaseUrl(`/img/${learn.shotDark}`);
  const generated = useBaseUrl('/img/generated/');

  return (
    <section className={`${styles.section} ${styles.learnSection}`} aria-labelledby="learn-title">
      <div className={styles.wrap}>
        <h2 id="learn-title" className={styles.sectionTitle}>
          {learn.title}
        </h2>
        <p className={styles.sectionLead}>{learn.lead}</p>

        <div className={styles.learnGrid}>
          <dl className={styles.facts}>
            {learn.facts.map((fact) => (
              <div key={fact.title}>
                <dt>{fact.title}</dt>
                <dd>{fact.text}</dd>
              </div>
            ))}
          </dl>
          {/* The capture in the theme of the page (the dark one is the application in its dark theme), shown at the region of
              the lesson panel that says the check passed and the code beside it. */}
          <span className={styles.shotFigure}>
            {[
              ['light', shot],
              ['dark', shotDark],
            ].map(([theme, src]) => (
              <Crop
                key={theme}
                className={`zplc-${theme}-only`}
                src={src}
                alt={learn.captureAlt}
                box={[40, 60, 900, 395]}
                size={[1440, 900]}
              />
            ))}
          </span>
        </div>

        <h3 className={styles.subTitle}>{learn.courseTitle}</h3>
        <div className={styles.chart}>
          {learn.levels.map((level, levelIndex) => (
            <div key={level} className={styles.branch}>
              <p className={styles.branchLabel}>{level}</p>
              <ol className={styles.steps}>
                {learn.modules
                  .filter((module) => module.level === levelIndex)
                  .map((module) => (
                    <li key={module.number} value={module.number} className={styles.step} data-initial={module.number === 0 || undefined}>
                      <span className={styles.stepBox} aria-hidden="true">
                        {module.number}
                      </span>
                      <span className={styles.stepTitle}>{module.title}</span>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>

        <h3 className={styles.subTitle}>{learn.plantsTitle}</h3>
        <ul className={styles.plants}>
          {learn.plants.map((plant) => (
            <li key={plant.key}>
              <span className={styles.plantArt}>
                {['light', 'dark'].map((theme) => (
                  <img
                    key={theme}
                    className={`zplc-${theme}-only`}
                    src={`${generated}plant-${plant.key}-${theme}.avif`}
                    alt={plant.alt}
                    width="900"
                    height="672"
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </span>
              <p className={styles.plantName}>{plant.name}</p>
              <p className={styles.plantLesson}>{plant.lesson}</p>
            </li>
          ))}
        </ul>

        <p className={styles.links}>
          {learn.links.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </p>
      </div>
    </section>
  );
}
