interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 shadow-md shadow-blue-900/30 hover:shadow-lg hover:shadow-blue-900/40',
  secondary: 'bg-[#161b27] border border-[#1e2535] text-slate-300 hover:bg-[#1e2535] active:bg-[#1a2744]',
  danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700 shadow-md shadow-red-900/30',
  ghost: 'text-slate-400 hover:bg-[#1e2535] hover:text-slate-200 active:bg-[#1a2744]',
}

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0f1117] disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
