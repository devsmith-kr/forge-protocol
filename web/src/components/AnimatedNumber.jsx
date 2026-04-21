import { useState, useEffect } from 'react'
import { useSpring, useTransform } from 'framer-motion'

export default function AnimatedNumber({ value }) {
  const spring = useSpring(value, { stiffness: 100, damping: 20 })
  const display = useTransform(spring, v => Math.round(v))
  const [shown, setShown] = useState(value)
  useEffect(() => { spring.set(value) }, [value, spring])
  useEffect(() => display.on('change', v => setShown(v)), [display])
  return <span>{shown}</span>
}
