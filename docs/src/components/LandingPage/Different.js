import Link from '@docusaurus/Link';
import styles from './LandingPage.module.css';
import { useLandingPageContent, withCode } from './content';

// IEC 60617 ladder symbols, drawn on a 48 x 24 grid with the rung at y = 12: a normally open contact and a coil.
function Contact() {
  return (
    <svg className={styles.symbol} viewBox="0 0 48 24" aria-hidden="true" focusable="false">
      <path d="M0 12H18M18 4V20M30 4V20M30 12H48" />
    </svg>
  );
}

function Coil() {
  return (
    <svg className={styles.symbol} viewBox="0 0 48 24" aria-hidden="true" focusable="false">
      <path d="M0 12H16M32 12H48M19 4C14 8 14 16 19 20M29 4C34 8 34 16 29 20" />
    </svg>
  );
}

// The order of one scan as a timing diagram: three signals over three scans. It shows an order, not measured times.
function ScanTiming({ timing }) {
  const pulses = [
    [0, 7],
    [9, 42],
    [44, 52],
  ];
  const scans = [0, 92, 184];
  return (
    <figure className={styles.timing}>
      <svg viewBox="0 0 400 96" role="img" aria-label={`${timing.caption}: ${timing.rows.join(', ')}`}>
        {timing.rows.map((row, index) => {
          const y = 14 + index * 30;
          const wave = scans
            .map((start) => {
              const [from, to] = pulses[index];
              return `L${start + from + 120} ${y + 10} L${start + from + 120} ${y} L${start + to + 120} ${y} L${start + to + 120} ${
                y + 10
              }`;
            })
            .join(' ');
          return (
            <g key={row}>
              <text x="0" y={y + 9} className={styles.timingLabel}>
                {row}
              </text>
              <path d={`M120 ${y + 10} ${wave} L400 ${y + 10}`} className={styles.timingWave} data-row={index} />
            </g>
          );
        })}
        {scans.map((start) => (
          <line key={start} x1={start + 120} x2={start + 120} y1="4" y2="92" className={styles.timingGrid} />
        ))}
      </svg>
      <figcaption>{timing.caption}</figcaption>
    </figure>
  );
}

// What makes ZPLC different: portability first, with the HAL drawn as a terminal strip whose terminals are its functions,
// then the other distinctive features as the rungs of a ladder between two power rails.
export default function Different() {
  const { different } = useLandingPageContent();
  const { port } = different;
  let terminal = 0;

  return (
    <section className={styles.section} aria-labelledby="different-title">
      <div className={styles.wrap}>
        <h2 id="different-title" className={styles.sectionTitle}>
          {different.title}
        </h2>
        <p className={styles.sectionLead}>{different.lead}</p>

        <div className={styles.portGrid}>
          <div className={styles.portCopy}>
            <h3 className={styles.portTitle}>{port.title}</h3>
            <p className={styles.portText}>{port.text}</p>
            <h4 className={styles.targetsTitle}>{port.targetsTitle}</h4>
            <dl className={styles.targets}>
              {port.targets.map((target) => (
                <div key={target.name}>
                  <dt>{target.name}</dt>
                  <dd>{withCode(target.text)}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.links}>
              {port.links.map((link) => (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ))}
            </p>
          </div>

          <figure className={styles.strip} aria-labelledby="hal-strip-title">
            <figcaption id="hal-strip-title" className={styles.stripHead}>
              <span>{port.stripTitle}</span>
              <code>zplc_hal.h</code>
            </figcaption>
            <div className={styles.rail} aria-hidden="true" />
            {port.groups.map((group) => (
              <div key={group.key} className={styles.stripGroup} data-optional={group.optional ? 'true' : undefined}>
                <p className={styles.stripLabel}>{group.label}</p>
                <ol className={styles.terminals}>
                  {group.functions.map((name) => {
                    terminal += 1;
                    return (
                      <li key={name} value={terminal}>
                        <span className={styles.terminalTag} aria-hidden="true">
                          {group.optional ? '-' : terminal}
                        </span>
                        <code>{name}()</code>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </figure>
        </div>

        <ol className={styles.ladder}>
          {different.rungs.map((rung) => (
            <li key={rung.title} className={styles.rung}>
              <Contact />
              <div className={styles.rungBody}>
                <h3 className={styles.rungTitle}>{rung.title}</h3>
                <div className={styles.rungText}>
                  <p>{withCode(rung.text)}</p>
                  {rung.timing && <ScanTiming timing={different.timing} />}
                  <Link to={rung.to}>{rung.link}</Link>
                </div>
              </div>
              <Coil />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
