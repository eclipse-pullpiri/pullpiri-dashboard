import express from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import cors from 'cors'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// .env 로더 (dotenv 패키지 없이 동작)
//   프로젝트 루트의 .env 파일을 읽어 process.env 에 주입한다.
//   이미 설정된 환경 변수는 덮어쓰지 않는다.
//   dotenv 패키지가 설치되어 있으면 그것을 우선 사용해도 무방하다.
// ---------------------------------------------------------------------------
function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env')
    if (!fs.existsSync(envPath)) return
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      // 양쪽 따옴표 제거
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  } catch (e) {
    console.warn('[server] .env load skipped:', e)
  }
}

loadDotEnv()

const execAsync = promisify(exec)
const app = express()

app.use(cors())
app.use(express.json())

let lastData: any = null
let lastTs = 0
const CACHE_TTL_MS = 3000

async function getPodsRaw() {
  // Podman 버전에 따라 --format json 이 지원 안 되면 다른 포맷 필요할 수 있음
  const { stdout } = await execAsync('podman ps --format json')
  return JSON.parse(stdout)
}

function mapPodmanToDTO(raw: any[]): any[] {
  return raw.map(item => ({
    id: item.Id,
    name: item.Names?.[0] || item.Names || '',
    image: item.Image || item.ImageName,
    status: item.Status,
    state: item.State,
    createdAt: item.CreatedAt,
    ports: item.Ports,
    command: item.Command,
    labels: item.Labels
  }))
}

app.get('/api/pods', async (_req, res) => {
  try {
    const now = Date.now()
    if (!lastData || now - lastTs > CACHE_TTL_MS) {
      const raw = await getPodsRaw()
      lastData = mapPodmanToDTO(raw)
      lastTs = now
    }
    res.json({ ok: true, data: lastData, cachedAt: new Date(lastTs).toISOString() })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// ---------------------------------------------------------------------------
// Demo: AWS agent subscription (pharos 네트워크 매니저 + AWS 트리거, 2단계)
//
// 대시보드에서 "구독"/"해지" 클릭 시 아래 2단계 REST 호출을 순차 수행한다.
//   1) HPC 의 pharos(네트워크 매니저) 로 /network 요청 → 네트워크 경로 설정
//   2) AWS Cloud-0x 의 pullpiri 리스너로 /trigger 요청 → nodeagent 기동/정지
// 구독(start)·해지(stop) 모두 동일하게 ① pharos → ② trigger 순서로 호출한다.
//
// 두 호출 모두 동일한 Body 를 사용한다:
//   { agentId, nodeName, action: "start" | "stop" }
//
// 실제 조인 여부/리소스/Pod 목록은 대시보드가 /api/v1/metrics/nodes 를
// 폴링하여 확인하므로, 이 서버는 "네트워크 설정 + 기동/정지 트리거"만 담당한다.
// ---------------------------------------------------------------------------

interface AgentConfig {
  id: string
  label: string
  // 대시보드가 노드 목록(/api/v1/metrics/nodes)에서 이 이름으로 조인 여부를 판단
  nodeName: string
  // AWS 쪽 트리거 리스너(pullpiri) URL. 대시보드는 이 URL 로 트리거 신호만 보낸다.
  triggerUrl: string
  // 선택: 트리거 요청 인증용 토큰 (Authorization: Bearer <token>)
  triggerToken?: string
}

// pharos(HPC 네트워크 매니저) 설정.
//   대시보드는 구독/해지 시 이 URL 로 먼저 네트워크 설정 요청을 보낸다.
//   PHAROS_NETWORK_URL 환경변수로 오버라이드 가능.
const PHAROS_NETWORK_URL =
  process.env.PHAROS_NETWORK_URL || 'http://192.168.10.11:9000/network'
const PHAROS_NETWORK_TOKEN = process.env.PHAROS_NETWORK_TOKEN

// TODO: 실제 AWS 트리거 엔드포인트로 교체하세요.
// 환경변수로 오버라이드할 수 있도록 process.env 를 우선 사용합니다.
const AGENTS: Record<string, AgentConfig> = {
  // cloud A = 기존 cloud-01 과 동일
  'aws-agent-1': {
    id: 'aws-agent-1',
    label: 'Cloud A',
    nodeName: process.env.AWS_AGENT1_NODENAME || 'cloud-01',
    triggerUrl: process.env.AWS_AGENT1_TRIGGER_URL || 'http://10.0.0.30:9000/trigger',
    triggerToken: process.env.AWS_AGENT1_TRIGGER_TOKEN || process.env.AWS_AGENT_TRIGGER_TOKEN,
  },
  // cloud C = 아직 미정 (TBD). nodeName/triggerUrl 은 확정 후 .env 로 갱신.
  'aws-agent-2': {
    id: 'aws-agent-2',
    label: 'Cloud C',
    nodeName: process.env.AWS_AGENT2_NODENAME || 'cloud-02',
    triggerUrl: process.env.AWS_AGENT2_TRIGGER_URL || 'http://0.0.0.0:9000/trigger',
    triggerToken: process.env.AWS_AGENT2_TRIGGER_TOKEN || process.env.AWS_AGENT_TRIGGER_TOKEN,
  },
}

// 공통 JSON POST 헬퍼.
//   url  : 대상 엔드포인트
//   body : { agentId, nodeName, action }
//   token: 있으면 Authorization: Bearer 헤더 추가
// DEMO_DRY_RUN=1 이면 실제 전송 없이 로그만 남긴다.
async function postJson(
  label: string,
  url: string,
  body: Record<string, unknown>,
  token?: string
): Promise<string> {
  const payload = JSON.stringify(body)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  console.log(`[demo][${label}] POST ${url} ${payload}`)

  if (process.env.DEMO_DRY_RUN === '1') {
    return `[dry-run] POST ${url} ${payload}`
  }

  // Node 18+ 전역 fetch 사용. 타임아웃은 AbortController 로 처리.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    })
    const text = await resp.text().catch(() => '')
    // 응답 상태코드와 본문을 로그로 남긴다 (pharos/trigger 응답 확인용).
    console.log(`[demo][${label}] <- ${resp.status} ${text || '(empty body)'}`)
    if (!resp.ok) {
      throw new Error(`${label} responded ${resp.status}: ${text}`)
    }
    return text || `${label} accepted (${resp.status})`
  } finally {
    clearTimeout(timer)
  }
}

// 구독/해지 트리거를 2단계로 수행한다.
//   start/stop 모두 ① pharos /network → ② AWS /trigger 순서로 호출한다.
// 어느 단계든 실패하면 예외를 던져 호출부에서 500 으로 응답한다.
async function runSubscription(
  agent: AgentConfig,
  action: 'start' | 'stop'
): Promise<{ network: string; trigger: string }> {
  const body = { agentId: agent.id, nodeName: agent.nodeName, action }

  const network = await postJson('pharos', PHAROS_NETWORK_URL, body, PHAROS_NETWORK_TOKEN)

  // DEMO_SKIP_TRIGGER=1 이면 pharos /network 단계만 테스트하고 AWS /trigger 는 건너뛴다.
  //   (AWS 쪽이 아직 준비되지 않았을 때 pharos 연동만 검증하는 용도)
  if (process.env.DEMO_SKIP_TRIGGER === '1') {
    console.log('[demo][trigger] skipped (DEMO_SKIP_TRIGGER=1)')
    return { network, trigger: '[skipped] DEMO_SKIP_TRIGGER=1' }
  }

  const trigger = await postJson('trigger', agent.triggerUrl, body, agent.triggerToken)
  return { network, trigger }
}

// 구독: ① pharos 네트워크 설정 → ② AWS start 트리거 → nodeagent 가 master 에 스스로 등록
app.post('/demo/subscribe', async (req, res) => {
  const { agentId } = req.body || {}
  const agent = AGENTS[agentId]
  if (!agent) {
    return res.status(400).json({ ok: false, error: `unknown agentId: ${agentId}` })
  }
  try {
    const out = await runSubscription(agent, 'start')
    console.log(`[demo] subscribe ${agentId} network+trigger sent`)
    res.json({ ok: true, agentId, action: 'subscribe', output: out })
  } catch (e: any) {
    console.error(`[demo] subscribe ${agentId} failed:`, e.message)
    res.status(500).json({ ok: false, agentId, error: e.message })
  }
})

// 해지: ① pharos 네트워크 해제 → ② AWS stop 트리거 → heartbeat 끊기면 노드 목록에서 사라짐
app.delete('/demo/subscribe', async (req, res) => {
  const { agentId } = req.body || {}
  const agent = AGENTS[agentId]
  if (!agent) {
    return res.status(400).json({ ok: false, error: `unknown agentId: ${agentId}` })
  }
  try {
    const out = await runSubscription(agent, 'stop')
    console.log(`[demo] unsubscribe ${agentId} network+trigger sent`)
    res.json({ ok: true, agentId, action: 'unsubscribe', output: out })
  } catch (e: any) {
    console.error(`[demo] unsubscribe ${agentId} failed:`, e.message)
    res.status(500).json({ ok: false, agentId, error: e.message })
  }
})

// 대시보드가 표시명/노드이름 매핑을 알 수 있도록 agent 목록 제공 (SSH 정보는 노출하지 않음)
app.get('/demo/agents', (_req, res) => {
  const list = Object.values(AGENTS).map(a => ({
    id: a.id,
    label: a.label,
    nodeName: a.nodeName,
  }))
  res.json({ ok: true, agents: list })
})

const PORT = process.env.BACKEND_PORT || 5174
app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`)
})
