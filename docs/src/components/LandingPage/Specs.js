import styles from './LandingPage.module.css';
import { useLandingPageContent, withCode } from './content';

// The technical data of ZPLC, set as the data sheet of a controller: one parameter per row.
export default function Specs() {
  const { specs } = useLandingPageContent();

  return (
    <section className={styles.section} aria-labelledby="specs-title">
      <div className={`${styles.wrap} ${styles.specsGrid}`}>
        <h2 id="specs-title" className={styles.sectionTitle}>
          {specs.title}
        </h2>
        <table className={styles.specs}>
          <tbody>
            {specs.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{withCode(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
