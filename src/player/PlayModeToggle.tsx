import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRepeat } from '@fortawesome/free-solid-svg-icons'
import { cyclePlayMode, usePlayMode } from './playerStore'

type PlayModeToggleProps = {
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Sequential ↔ single-loop toggle. Soft stroke color; badge "1" sits
 * bottom-right. Switch uses a light scale pop (no rotate).
 */
export function PlayModeToggle({ size = 'sm', className = '' }: PlayModeToggleProps) {
  const playMode = usePlayMode()
  const [popKey, setPopKey] = useState(0)
  const prevMode = useRef(playMode)

  useEffect(() => {
    if (prevMode.current !== playMode) {
      prevMode.current = playMode
      setPopKey((k) => k + 1)
    }
  }, [playMode])

  const box = size === 'md' ? 'h-10 w-10' : 'h-9 w-9'
  const icon = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  const badge = size === 'md' ? 'text-[9px]' : 'text-[8px]'
  const looping = playMode === 'loop-one'

  return (
    <button
      type="button"
      onClick={() => cyclePlayMode()}
      title={looping ? '单曲循环' : '顺序播放'}
      aria-label={looping ? '单曲循环' : '顺序播放'}
      className={`relative inline-flex ${box} items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/55 ${className}`}
    >
      <span
        key={popKey}
        className={`relative inline-flex items-center justify-center ${
          popKey > 0 ? 'play-mode-pop' : ''
        }`}
      >
        <FontAwesomeIcon icon={faRepeat} className={icon} />
        <span
          className={`pointer-events-none absolute -right-0.5 -bottom-0.5 ${badge} font-semibold leading-none transition-[opacity,transform] duration-200 ease-out ${
            looping ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
          aria-hidden={!looping}
        >
          1
        </span>
      </span>
    </button>
  )
}
