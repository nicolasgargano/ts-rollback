import { useEffect, useRef } from "react"

// Adapted from https://overreacted.io/making-setinterval-declarative-with-react-hooks/
export const useInterval = (callback: (tick: number) => void, delay: number | undefined) => {
  const savedCallback = useRef<(tick: number) => void | undefined>()
  let tick = 0

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval.
  useEffect(() => {
    const tickFn = () => {
      if (savedCallback.current) savedCallback.current(tick)
      tick++
    }
    if (delay !== null) {
      let id = setInterval(tickFn, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}
