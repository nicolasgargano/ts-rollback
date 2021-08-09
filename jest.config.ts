import type { Config } from "@jest/types"

export default async (): Promise<Config.InitialOptions> => {
  return {
    verbose: true,
    preset: "ts-jest",
    testEnvironment: "node",
    moduleFileExtensions: ["js", "jsx", "ts", "tsx"],
    collectCoverage: true,
    testMatch: ["**/?(*.)[jt]s?(x)"]
  }
}
