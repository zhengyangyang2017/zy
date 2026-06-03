import https from 'https'

function getEnv(key: string): string {
  return (import.meta as { env?: Record<string, string> }).env?.[key]
    || process.env[key]
    || ''
}

const apiKey = getEnv('VITE_ANTHROPIC_API_KEY') || getEnv('ANTHROPIC_API_KEY') || ''
const baseUrl = getEnv('VITE_API_BASE_URL') || 'https://api.deepseek.com'
const modelName = getEnv('VITE_MODEL_NAME') || 'deepseek-v4-pro'

const url = new URL(baseUrl)
const DEFAULT_HOST = url.hostname
const DEFAULT_PATH = url.pathname.replace(/\/+$/, '') + '/chat/completions'

export interface CallLLMParams {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
}

export async function callLLM(params: CallLLMParams): Promise<string> {
  const { systemPrompt, userPrompt, maxTokens = 2000, temperature = 0.1 } = params

  const body = JSON.stringify({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  })

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: DEFAULT_HOST,
        path: DEFAULT_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': String(Buffer.byteLength(body)),
        },
      },
      (resp) => {
        const chunks: Buffer[] = []
        resp.on('data', (chunk: Buffer) => chunks.push(chunk))
        resp.on('end', () => {
          const raw = Buffer.concat(chunks).toString()
          if (resp.statusCode !== 200) {
            reject(new Error(`LLM call failed: ${resp.statusCode} ${raw.slice(0, 200)}`))
            return
          }
          try {
            const json = JSON.parse(raw)
            resolve(json.choices?.[0]?.message?.content || '')
          } catch {
            reject(new Error(`LLM parse failed: ${raw.slice(0, 200)}`))
          }
        })
      }
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}
