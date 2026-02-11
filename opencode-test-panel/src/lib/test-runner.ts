import { client } from "./client"
import type { TestCase, TestModule, TestFramework, TestRunResult } from "./types"

/**
 * Discover test files in the project using OpenCode's find API.
 */
export async function discoverTestFiles(): Promise<string[]> {
  try {
    const result = await client.find.files({
      query: { query: "test_*.py", type: "file" },
    })
    const files = (result.data ?? []) as string[]

    // Also search for *_test.py pattern
    const result2 = await client.find.files({
      query: { query: "*_test.py", type: "file" },
    })
    const files2 = (result2.data ?? []) as string[]

    // Deduplicate
    const all = new Set([...files, ...files2])
    return Array.from(all).sort()
  } catch (e) {
    console.error("Failed to discover test files:", e)
    return []
  }
}

/**
 * Parse test functions from a Python test file using OpenCode's file read API.
 */
export async function parseTestFile(filepath: string): Promise<TestCase[]> {
  try {
    const result = await client.file.read({
      query: { path: filepath },
    })
    const content = (result.data as any)?.content ?? ""
    const lines = content.split("\n")
    const tests: TestCase[] = []

    // Extract module name from filepath
    const moduleName = filepath.replace(/\//g, ".").replace(/\.py$/, "")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Match pytest-style: def test_xxx(
      const pytestMatch = line.match(/^\s*def\s+(test_\w+)\s*\(/)
      if (pytestMatch) {
        tests.push({
          id: `${filepath}::${pytestMatch[1]}`,
          name: pytestMatch[1],
          module: moduleName,
          filepath,
          lineno: i + 1,
          status: "idle",
        })
        continue
      }

      // Match unittest-style: class TestXxx(unittest.TestCase)
      // We'll track the class name and find methods inside
      const classMatch = line.match(
        /^\s*class\s+(Test\w+)\s*\(.*(?:TestCase|unittest)/
      )
      if (classMatch) {
        const className = classMatch[1]
        // Scan ahead for test methods
        for (let j = i + 1; j < lines.length; j++) {
          const methodLine = lines[j]
          // Stop at next class or top-level def
          if (/^class\s/.test(methodLine) || /^def\s/.test(methodLine)) break
          const methodMatch = methodLine.match(/^\s+def\s+(test_\w+)\s*\(/)
          if (methodMatch) {
            tests.push({
              id: `${filepath}::${className}::${methodMatch[1]}`,
              name: `${className}.${methodMatch[1]}`,
              module: moduleName,
              filepath,
              lineno: j + 1,
              status: "idle",
            })
          }
        }
      }
    }

    return tests
  } catch (e) {
    console.error(`Failed to parse test file ${filepath}:`, e)
    return []
  }
}

/**
 * Detect test framework from project files.
 */
export async function detectFramework(): Promise<TestFramework> {
  try {
    // Check for pytest.ini, pyproject.toml with pytest config, setup.cfg
    const files = await client.find.files({
      query: { query: "pytest.ini", type: "file" },
    })
    if (((files.data ?? []) as string[]).length > 0) return "pytest"

    const conftest = await client.find.files({
      query: { query: "conftest.py", type: "file" },
    })
    if (((conftest.data ?? []) as string[]).length > 0) return "pytest"

    // Default to pytest as it's more common
    return "pytest"
  } catch {
    return "pytest"
  }
}

/**
 * Build the command to run tests via OpenCode's shell API.
 */
export function buildTestCommand(
  framework: TestFramework,
  targets?: string[],
  verbose = true
): string {
  if (framework === "pytest") {
    const args = [
      "python",
      "-m",
      "pytest",
      verbose ? "-v" : "",
      "--tb=short",
      "--no-header",
      ...(targets ?? []),
    ]
    return args.filter(Boolean).join(" ")
  }

  // unittest
  if (targets && targets.length > 0) {
    return `python -m unittest ${verbose ? "-v" : ""} ${targets.join(" ")}`
  }
  return `python -m unittest discover ${verbose ? "-v" : ""}`
}

/**
 * Parse pytest verbose output to extract individual test results.
 */
export function parsePytestOutput(output: string): Map<string, { status: TestCase["status"]; duration?: number; error?: string }> {
  const results = new Map<string, { status: TestCase["status"]; duration?: number; error?: string }>()

  for (const line of output.split("\n")) {
    // Match: tests/test_example.py::test_func PASSED [ 50%]
    const match = line.match(
      /^(.+?::[\w.]+)\s+(PASSED|FAILED|ERROR|SKIPPED)/
    )
    if (match) {
      const testId = match[1].trim()
      const statusMap: Record<string, TestCase["status"]> = {
        PASSED: "passed",
        FAILED: "failed",
        ERROR: "error",
        SKIPPED: "skipped",
      }
      results.set(testId, { status: statusMap[match[2]] ?? "error" })
    }
  }

  return results
}

/**
 * Parse unittest verbose output.
 */
export function parseUnittestOutput(output: string): Map<string, { status: TestCase["status"]; error?: string }> {
  const results = new Map<string, { status: TestCase["status"]; error?: string }>()

  for (const line of output.split("\n")) {
    // Match: test_func (test_module.TestClass) ... ok
    const match = line.match(
      /^(test_\w+)\s+\((.+?)\)\s+\.\.\.\s+(ok|FAIL|ERROR|skip)/i
    )
    if (match) {
      const testName = match[1]
      const module = match[2]
      const statusMap: Record<string, TestCase["status"]> = {
        ok: "passed",
        FAIL: "failed",
        ERROR: "error",
        skip: "skipped",
      }
      results.set(`${module}.${testName}`, {
        status: statusMap[match[3]] ?? "error",
      })
    }
  }

  return results
}

/**
 * Parse summary line from test output.
 */
export function parseSummary(output: string): Partial<TestRunResult> {
  // pytest: "5 passed, 2 failed, 1 error in 1.23s"
  const pytestMatch = output.match(
    /=+\s*([\d\w\s,]+)\s+in\s+([\d.]+)s\s*=+/
  )
  if (pytestMatch) {
    const summary = pytestMatch[1]
    const duration = parseFloat(pytestMatch[2])
    const passed = parseInt(summary.match(/(\d+)\s+passed/)?.[1] ?? "0")
    const failed = parseInt(summary.match(/(\d+)\s+failed/)?.[1] ?? "0")
    const errors = parseInt(summary.match(/(\d+)\s+error/)?.[1] ?? "0")
    const skipped = parseInt(summary.match(/(\d+)\s+skipped/)?.[1] ?? "0")
    return {
      total: passed + failed + errors + skipped,
      passed,
      failed,
      errors,
      skipped,
      duration,
    }
  }

  // unittest: "Ran 5 tests in 0.123s"
  const unittestMatch = output.match(/Ran\s+(\d+)\s+tests?\s+in\s+([\d.]+)s/)
  if (unittestMatch) {
    return {
      total: parseInt(unittestMatch[1]),
      duration: parseFloat(unittestMatch[2]),
    }
  }

  return {}
}
