// v1 + v2
import { Vector, Vector2 } from "@dimforge/rapier2d-compat"

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

// v * s
export const scale = (s: number) => (v: Vector) => new Vector2(v.x * s, v.y * s)
