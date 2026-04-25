import { useState, useRef, useCallback, useEffect } from 'react'

type Direction = 'right' | 'left'

export function useResize(minWidth: number, maxWidth: number, initialWidth: number, direction: Direction) {
  const [width, setWidth] = useState(initialWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const delta = direction === 'right'
      ? e.clientX - startX.current
      : startX.current - e.clientX
    setWidth(Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta)))
  }, [direction, minWidth, maxWidth])

  const onMouseUp = useCallback(() => {
    dragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [width, onMouseMove, onMouseUp])

  useEffect(() => () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove, onMouseUp])

  return { width, onMouseDown }
}
