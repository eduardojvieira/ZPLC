import Link from '@docusaurus/Link';
import styles from './LandingPage.module.css';
import { useLandingPageContent, withCode } from './content';

// The architecture as a block diagram drawn by the page: the stages from the source to the HAL, wired left to right, the
// application spanning the stages it owns, and the three ports under the HAL. It follows the colour mode because it is
// built from the tokens, not painted.
export default function Architecture() {
  const { architecture } = useLandingPageContent();

  return (
    <section className={styles.section} aria-labelledby="architecture-title">
      <div className={styles.wrap}>
        <h2 id="architecture-title" className={styles.sectionTitle}>
          {architecture.title}
        </h2>
        <p className={styles.sectionLead}>{withCode(architecture.lead)}</p>

        <figure className={styles.flow}>
          <p className={styles.flowApp}>{architecture.app}</p>
          <ol className={styles.stages}>
            {architecture.stages.map((stage) => (
              <li key={stage.title} className={styles.stage}>
                <span className={styles.stageTitle}>{stage.title}</span>
                <span className={styles.stageItems}>
                  {stage.items.map((item) => (
                    <span key={item}>{withCode(item)}</span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          <ul className={styles.ports}>
            {architecture.ports.map((port) => (
              <li key={port.name}>
                <span className={styles.portName}>{port.name}</span>
                <span className={styles.portNote}>{port.note}</span>
              </li>
            ))}
          </ul>
        </figure>

        <p className={styles.links}>
          {architecture.links.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </p>
      </div>
    </section>
  );
}
