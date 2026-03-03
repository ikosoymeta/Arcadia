import type { InterfaceMode } from '../../types';
import styles from './ModeSwitcher.module.css';

interface ModeSwitcherProps {
  mode: InterfaceMode;
  onChange: (mode: InterfaceMode) => void;
}

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div className={styles.switcher}>
      <button
        className={`${styles.btn} ${mode === 'simple' ? styles.active : ''}`}
        onClick={() => onChange('simple')}
        title="Simple mode — friendly interface for everyone"
      >
        <span className={styles.icon}>✦</span>
        <span className={styles.label}>Simple</span>
      </button>
      <button
        className={`${styles.btn} ${mode === 'engineer' ? styles.active : ''}`}
        onClick={() => onChange('engineer')}
        title="Engineer mode — terminal, API logs, debug console"
      >
        <span className={styles.icon}>⌨</span>
        <span className={styles.label}>Engineer</span>
      </button>
    </div>
  );
}
