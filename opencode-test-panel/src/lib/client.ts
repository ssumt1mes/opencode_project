import { createOpencodeClient } from "@opencode-ai/sdk/client"

const OPENCODE_URL =
  import.meta.env.VITE_OPENCODE_URL || "http://localhost:4096"

export const client = createOpencodeClient({
  baseUrl: OPENCODE_URL,
})
