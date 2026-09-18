import { useCallback, useRef, useState, type PointerEvent } from 'react'
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion'
import logoIsshin from '@/assets/logo_isshin_agent.png'

const MAX_TILT = 18
const SPRING = { stiffness: 320, damping: 22, mass: 0.55 }

export function SidebarLogo() {
  const ref = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const scaleTarget = useMotionValue(1)
  const liftTarget = useMotionValue(0)

  const rotateX = useSpring(
    useTransform(rawY, [-0.5, 0.5], [MAX_TILT, -MAX_TILT]),
    SPRING,
  )
  const rotateY = useSpring(
    useTransform(rawX, [-0.5, 0.5], [-MAX_TILT, MAX_TILT]),
    SPRING,
  )
  const scale = useSpring(scaleTarget, SPRING)
  const lift = useSpring(liftTarget, SPRING)

  const glareX = useSpring(useTransform(rawX, [-0.5, 0.5], [12, 88]), SPRING)
  const glareY = useSpring(useTransform(rawY, [-0.5, 0.5], [12, 88]), SPRING)
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 28%, transparent 58%)`

  const onMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      rawX.set((e.clientX - rect.left) / rect.width - 0.5)
      rawY.set((e.clientY - rect.top) / rect.height - 0.5)
    },
    [rawX, rawY],
  )

  const onEnter = useCallback(() => {
    setHovering(true)
    scaleTarget.set(1.08)
    liftTarget.set(-6)
  }, [scaleTarget, liftTarget])

  const onLeave = useCallback(() => {
    setHovering(false)
    rawX.set(0)
    rawY.set(0)
    scaleTarget.set(1)
    liftTarget.set(0)
  }, [rawX, rawY, scaleTarget, liftTarget])

  return (
    <div
      className="logo-3d-scene relative h-14 w-14 shrink-0"
      style={{ perspective: 640 }}
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <motion.div
        ref={ref}
        className="logo-3d-card relative h-full w-full"
        style={{
          rotateX,
          rotateY,
          scale,
          y: lift,
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-xl bg-zinc-900"
          style={{ transform: 'translateZ(-10px) scale(0.96)', opacity: 0.55 }}
        />

        <img
          src={logoIsshin}
          alt="Isshin"
          draggable={false}
          className="relative h-full w-full rounded-xl object-cover ring-1 ring-border/50"
          style={{ transform: 'translateZ(18px)' }}
        />

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl mix-blend-soft-light"
          style={{
            background: glare,
            opacity: hovering ? 1 : 0,
            transform: 'translateZ(28px)',
            transition: 'opacity 160ms ease',
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{
            transform: 'translateZ(30px)',
            boxShadow: hovering
              ? 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.35), 0 18px 28px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08)'
              : 'inset 0 1px 0 rgba(255,255,255,0.12), 0 6px 14px -8px rgba(0,0,0,0.45)',
            transition: 'box-shadow 200ms ease',
          }}
        />
      </motion.div>
    </div>
  )
}
