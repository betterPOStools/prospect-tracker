import styles from './Card.module.css'

export default function Card({ children, archived, className = '' }) {
  const cls = [styles.card, archived && styles.archived, className].filter(Boolean).join(' ')
  return <div className={cls}>{children}</div>
}

export const CardName    = ({ children }) => <div className={styles.name}>{children}</div>
export const CardDetail  = ({ children }) => <div className={styles.detail}>{children}</div>
export const CardActions = ({ children }) => <div className={styles.actions}>{children}</div>
