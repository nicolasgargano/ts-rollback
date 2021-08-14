import { Vector, Vector2 } from "@dimforge/rapier2d-compat"

// -- CONTSTANTS

export const up = { x: 0, y: 1 }
export const down = { x: 0, y: -1 }
export const right = { x: 1, y: 0 }
export const left = { x: -1, y: 0 }

// -- OPERATIONS

// v1 + v2
export const plus =
  (v1: Vector) =>
  (v2: Vector): Vector =>
    new Vector2(v1.x + v2.x, v1.y + v2.y)

// v1 - v2
export const minus =
  (v1: Vector) =>
  (v2: Vector): Vector =>
    new Vector2(v1.x - v2.x, v1.y - v2.y)

// v2 - v1
export const fromTo =
  (v1: Vector) =>
  (v2: Vector): Vector =>
    new Vector2(v2.x - v1.x, v2.y - v1.y)

export const length = (v: Vector) => Math.sqrt(v.x ** 2 + v.y ** 2)

export const normalized = (v: Vector) => {
  const l = length(v)
  return new Vector2(v.x / l, v.y / l)
}

export const rot = (v: Vector2) => Math.atan2(v.y, v.x)

// v * s
export const scale = (s: number) => (v: Vector) => new Vector2(v.x * s, v.y * s)
