import styles from './Button.module.css'

export default function Button({ children, variant, size, className = '', ...props }) {
  const cls = [
    styles.btn,
    variant && styles[variant],
    size && styles[size],
    className,
  ].filter(Boolean).join(' ')

  return (
    <button className={cls} {...props}>
      {children}
    </button>
  )
}
