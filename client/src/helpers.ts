export const log =
  (msg: string) =>
  <A>(a: A) => {
    console.log(msg, a)
    return a
  }
