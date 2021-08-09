export const assert = (expr: boolean, msg?: string) => {
  if (expr) {
    return
  } else {
    throw new Error(msg ? msg : "Assertion error")
  }
}
