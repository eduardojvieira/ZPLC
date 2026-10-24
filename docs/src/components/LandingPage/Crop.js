import styles from './LandingPage.module.css';

/**
 * A window onto one region of a real capture, so the page shows the evidence at a readable size while the published file
 * stays the capture the tool took. `box` is the region [x, y, width, height] and `size` the capture [width, height], in
 * pixels of the capture.
 */
export default function Crop({ src, alt, box: [x, y, w, h], size: [iw, ih], className = '' }) {
  return (
    <span className={`${styles.crop} ${className}`} style={{ '--x': x, '--y': y, '--w': w, '--h': h, '--iw': iw, '--ih': ih }}>
      <img src={src} alt={alt} width={iw} height={ih} loading="lazy" decoding="async" />
    </span>
  );
}
