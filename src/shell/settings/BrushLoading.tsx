import { motion } from 'framer-motion'

const STROKE_PATH =
  'M28 118 C 70 40, 120 150, 160 72 S 240 20, 292 88'

/** Animated paintbrush stroke while Agnes generates an image. */
export function BrushLoading({ label = '画笔挥洒中…' }: { label?: string }) {
  return (
    <div
      className="brush-loading relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-border-subtle bg-background/70 px-6 py-10"
      role="status"
      aria-label={label}
    >
      <div className="brush-loading-glow pointer-events-none absolute inset-0" />
      <div className="brush-loading-grid pointer-events-none absolute inset-0 opacity-[0.14]" />

      <div className="relative h-40 w-full max-w-md">
        <svg
          viewBox="0 0 320 160"
          className="h-full w-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <linearGradient id="brush-ink" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f0d78c" stopOpacity="0.15" />
              <stop offset="45%" stopColor="#e8c46a" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#c9a227" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="brush-body" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f5e6b8" />
              <stop offset="55%" stopColor="#c9a227" />
              <stop offset="100%" stopColor="#8a6a12" />
            </linearGradient>
            <filter id="brush-soft" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d={STROKE_PATH}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-border opacity-40"
            strokeDasharray="4 8"
          />

          <path
            className="brush-ink-wash"
            d={STROKE_PATH}
            stroke="#f0d78c"
            strokeWidth="14"
            strokeLinecap="round"
            opacity="0.12"
          />

          <path
            className="brush-ink-stroke"
            d={STROKE_PATH}
            stroke="url(#brush-ink)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#brush-soft)"
          />

          <g>
            <animateMotion
              dur="2.8s"
              repeatCount="indefinite"
              rotate="auto"
              path={STROKE_PATH}
              calcMode="spline"
              keyTimes="0;0.7;1"
              keySplines="0.4 0.05 0.2 1;0.4 0 0.2 1"
              keyPoints="0;1;1"
            />
            <g transform="translate(-10 -36) rotate(12)">
              <path
                d="M8 52 L14 8 Q16 2 20 8 L26 52 Z"
                fill="url(#brush-body)"
              />
              <rect x="11" y="48" width="12" height="18" rx="2" fill="#5c4a2a" />
              <path
                d="M12 66 L16 78 L20 66 Z"
                fill="#d4a017"
                className="brush-bristle"
              />
              <circle cx="16" cy="78" r="2.2" fill="#f0d78c" className="brush-drip" />
            </g>
          </g>

          <circle className="brush-splat brush-splat-a" cx="86" cy="64" r="2.5" fill="#e8c46a" />
          <circle className="brush-splat brush-splat-b" cx="168" cy="96" r="2" fill="#f0d78c" />
          <circle className="brush-splat brush-splat-c" cx="236" cy="48" r="1.8" fill="#c9a227" />
        </svg>
      </div>

      <motion.p
        className="mt-1 text-xs font-medium tracking-wide text-foreground"
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {label}
      </motion.p>
      <p className="mt-1 text-[10px] text-subtle">Agnes 正在绘制，通常需要数秒到几十秒</p>
    </div>
  )
}
