import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Crop from './Crop';
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
      <svg viewBox="0 0 400 96" role="img" aria-label={`${timing.caption} ${timing.rows.join(', ')}`}>
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

// The two details of the recorded capture (1080 x 675) that the figure shows: the status line and the code with its live
// values, then the inputs of the Live I/O faceplate.
const SHOT_SIZE = [1080, 675];
const SHOT_CODE = [250, 35, 830, 155];
const SHOT_FACEPLATE = [250, 552, 830, 123];

// Simulate and debug: the debugging features as the rungs of a ladder between two power rails, beside two details of a real
// capture of the simulator running the motor lesson (the recorded screen-reader check, its results.json lists the file).
export default function Debug() {
  const { debug } = useLandingPageContent();
  const shot = useBaseUrl(`/img/${debug.shot}`);

  return (
    <section className={styles.section} aria-labelledby="debug-title">
      <div className={styles.wrap}>
        <h2 id="debug-title" className={styles.sectionTitle}>
          {debug.title}
        </h2>
        <p className={styles.sectionLead}>{debug.lead}</p>

        <div className={styles.debugGrid}>
          <ol className={styles.ladder}>
            {debug.rungs.map((rung) => (
              <li key={rung.title} className={styles.rung}>
                <Contact />
                <div className={styles.rungBody}>
                  <h3 className={styles.rungTitle}>{rung.title}</h3>
                  <div className={styles.rungText}>
                    <p>{withCode(rung.text)}</p>
                    {rung.timing && <ScanTiming timing={debug.timing} />}
                    <Link to={rung.to}>{rung.link}</Link>
                  </div>
                </div>
                <Coil />
              </li>
            ))}
          </ol>
          <figure className={`${styles.shotFigure} ${styles.debugShot}`}>
            <Crop src={shot} alt={debug.shotAlt} box={SHOT_CODE} size={SHOT_SIZE} />
            <Crop src={shot} alt="" box={SHOT_FACEPLATE} size={SHOT_SIZE} />
            <figcaption>{debug.caption}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
