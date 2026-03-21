import styles from './Badge.module.css'

export default function Badge({ status, className = '' }) {
  const cls = [styles.badge, styles[status], className].filter(Boolean).join(' ')
  return <span className={cls}>{status}</span>
}

export function HoursChip({ label, isOpen, isUnknown }) {
  const cls = [
    styles.hoursChip,
    isOpen === true  && styles.openNow,
    isOpen === false && styles.closed,
  ].filter(Boolean).join(' ')
  return <span className={cls}>{label}</span>
}
