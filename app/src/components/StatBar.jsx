import styles from './StatBar.module.css'

// stats = [{ n: number, label: string }, ...]
export default function StatBar({ stats }) {
  return (
    <div className={styles.stats}>
      {stats.map(({ n, label }) => (
        <div key={label} className={styles.stat}>
          <div className={styles.statN}>{n}</div>
          <div className={styles.statL}>{label}</div>
        </div>
      ))}
    </div>
  )
}
