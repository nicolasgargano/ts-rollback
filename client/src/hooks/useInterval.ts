import { useEffect, useRef } from "react"

// Adapted from https://overreacted.io/making-setinterval-declarative-with-react-hooks/
export const useInterval = (
  onTick: (tick: number) => void,
  timeBetweenTicks: number | undefined
) => {
  const savedCallback = useRef<(tick: number) => void | undefined>()
  let tick = 0

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = onTick
  }, [onTick])

  // Set up the interval.
  useEffect(() => {
    const tickFn = () => {
      if (savedCallback.current) savedCallback.current(tick)
      tick++
    }
    if (timeBetweenTicks !== undefined) {
      let id = setInterval(tickFn, timeBetweenTicks)
      return () => clearInterval(id)
    }
  }, [timeBetweenTicks])
}
