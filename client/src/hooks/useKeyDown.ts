import { useEffect, useRef, useState } from "react"

export const useKeyDown = (key: string) => {
  const pressed = useRef(false)

  const isThisKey = (event: KeyboardEvent) => key.toLowerCase() == event.key.toLowerCase()

  const onDown = (event: KeyboardEvent) => {
    if (isThisKey(event)) pressed.current = true
  }

  const onUp = (event: KeyboardEvent) => {
    if (isThisKey(event)) pressed.current = false
  }

  useEffect(() => {
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
    }
  }, [key])

  return pressed.current
}
