import Link from '@docusaurus/Link';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

// Portability, the headline strength: the program wired to the one runtime and on to the three platforms it is built for,
// drawn by the page in the line work of a schematic (it conducts, green, under the pointer or the keyboard), then how a new
// microcontroller is ported, beside the hardware abstraction layer drawn as a terminal strip on a DIN rail.
export default function Portability() {
  const { portability } = useLandingPageContent();
  const { strip, wiring } = portability;
  let terminal = 0;

  return (
    <section className={styles.section} aria-labelledby="portability-title">
      <div className={styles.wrap}>
        <h2 id="portability-title" className={styles.sectionTitle}>
          {portability.title}
        </h2>
        <p className={styles.sectionLead}>{portability.lead}</p>

        <figure className={styles.wiring} aria-label={wiring.label}>
          <div className={styles.wNode} data-node="program">
            <span className={styles.wName}>{wiring.program.name}</span>
            <span className={styles.wText}>{wiring.program.text}</span>
          </div>
          <span className={styles.wWire} aria-hidden="true" />
          <div className={styles.wNode} data-node="runtime">
            <span className={styles.wName}>{wiring.runtime.name}</span>
            <span className={styles.wText}>{wiring.runtime.text}</span>
          </div>
          <span className={styles.wWire} aria-hidden="true" />
          <ul className={styles.wTargets}>
            {portability.platforms.map((platform) => (
              <li key={platform.name} className={styles.wNode}>
                <Link className={styles.wName} to={platform.to}>
                  {platform.name}
                </Link>
                <span className={styles.wText}>{platform.text}</span>
              </li>
            ))}
          </ul>
        </figure>

        <div className={styles.portGrid}>
          <div>
            <h3 className={styles.portTitle}>{portability.port.title}</h3>
            <p className={styles.portText}>{portability.port.text}</p>
            <p className={styles.links}>
              {portability.links.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </p>
          </div>

          <figure className={styles.strip} aria-labelledby="hal-strip-title">
            <figcaption id="hal-strip-title" className={styles.stripHead}>
              <span>{strip.title}</span>
              <span className={styles.stripCount}>{strip.count}</span>
            </figcaption>
            <div className={styles.rail} aria-hidden="true" />
            {strip.groups.map((group) => (
              <div key={group.key} className={styles.stripGroup} data-optional={group.optional ? 'true' : undefined}>
                <p className={styles.stripLabel}>{group.label}</p>
                <ol className={styles.terminals}>
                  {group.terminals.map((name) => {
                    if (!group.optional) terminal += 1;
                    return (
                      <li key={name}>
                        <span className={styles.terminalTag} aria-hidden="true">
                          {group.optional ? '-' : terminal}
                        </span>
                        <span>{name}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </figure>
        </div>
      </div>
    </section>
  );
}
