export type TestStatus = "idle" | "running" | "passed" | "failed" | "error" | "skipped"

export interface TestCase {
  id: string
  name: string
  module: string
  filepath: string
  lineno?: number
  status: TestStatus
  duration?: number
  output?: string
  error?: string
}

export interface TestModule {
  filepath: string
  name: string
  tests: TestCase[]
  expanded: boolean
}

export interface TestRunResult {
  total: number
  passed: number
  failed: number
  errors: number
  skipped: number
  duration: number
  timestamp: string
}

export type TestFramework = "pytest" | "unittest"
