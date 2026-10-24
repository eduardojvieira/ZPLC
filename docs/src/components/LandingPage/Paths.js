import Link from '@docusaurus/Link';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

// The symbol of each path, drawn on a 32 x 32 grid in the line work of the page: a controller module on its rail with a
// row of terminals along each edge (build), and the initial step of a sequential function chart with the link to the next
// step (learn).
const symbols = {
  build: <path d="M7 6H25V26H7ZM4 16H7M25 16H28M10 6V3M14 6V3M18 6V3M22 6V3M10 26V29M14 26V29M18 26V29M22 26V29M12 12H20V20H12Z" />,
  learn: <path d="M9 4H23V18H9ZM12 7H20V15H12ZM16 18V29M11 24H21" />,
};

// The two ways into ZPLC, with equal weight: build a controller (download the application) and learn PLC programming
// (Learn). The hero stacks them; the close of the page sets them side by side.
export default function Paths({ layout = 'stack', headingLevel = 2 }) {
  const { paths } = useLandingPageContent();
  const Heading = `h${headingLevel}`;

  return (
    <ul className={styles.paths} data-layout={layout} aria-label={paths.label}>
      {['build', 'learn'].map((key) => {
        const path = paths[key];
        return (
          <li key={key} className={styles.path}>
            <svg className={styles.pathSymbol} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              {symbols[key]}
            </svg>
            <Heading className={styles.pathTitle}>{path.title}</Heading>
            <p className={styles.pathText}>{path.text}</p>
            <div className={styles.pathRow}>
              <Link className={styles.pathAction} {...(path.href ? { href: path.href } : { to: path.to })}>
                {path.action}
              </Link>
              <p className={styles.pathMeta}>
                <span>{path.note}</span>
                <Link to={path.moreTo}>{path.more}</Link>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
