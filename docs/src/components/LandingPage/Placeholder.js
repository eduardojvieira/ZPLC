import styles from './LandingPage.module.css';

/**
 * A neutral, labelled box of the exact size of an image that does not exist yet: a generated image of
 * docs/design/image-plan.md or a real capture still to be taken. It is never a fake of the image. The box carries the final
 * alternative text, so that the page reads the same once the image replaces it; the visible label is for the reviewer.
 */
export default function Placeholder({ id, kind, label, path, width, height, alt, className }) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={`${styles.placeholder} ${className ?? ''}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      data-kind={kind}
    >
      <span className={styles.placeholderLabel} aria-hidden="true">
        <strong>{id}</strong>
        <span>{label}</span>
        <code>{path}</code>
        <span>
          {width} x {height}
        </span>
      </span>
    </div>
  );
}
