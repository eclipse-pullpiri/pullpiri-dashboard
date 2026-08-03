// SPDX-FileCopyrightText: Copyright 2024 LG Electronics Inc.
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Switch } from "./ui/switch";
import {
  Box,
  Server,
  Cpu,
  MemoryStick,
  Cloud,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 접근 A (= SSH) 기반 Demo 화면
//
//  - 구독 클릭  → POST   /demo/subscribe {agentId}  (중계 서버가 SSH로 nodeagent 기동)
//  - 해지 클릭  → DELETE /demo/subscribe {agentId}  (중계 서버가 SSH로 nodeagent 정지)
//  - 실제 조인/리소스/컨테이너 → /api/v1/metrics/nodes + /api/v1/metrics 폴링으로 확정
//
//  버튼은 "요청"만 하고, 조인 여부는 폴링 결과(노드가 나타났는지)로 확정한다.
// ---------------------------------------------------------------------------

// 구독 상태 머신
type SubState =
  | "unsubscribed" // 미구독 (노드 없음)
  | "subscribing" // 구독 요청 보냄, master 조인 대기 중
  | "subscribed" // 조인 확인됨 (노드 목록에 존재)
  | "unsubscribing"; // 해지 요청 보냄, 이탈 대기 중

// 대시보드가 아는 AWS agent 정의 (표시명 ↔ 실제 node_name 매핑)
interface AgentDef {
  id: string;
  label: string;
  nodeName: string; // /api/v1/metrics/nodes 의 node_name 과 매칭
  uri: string;
}

// 실제 node_name(원격 노드 hostname)은 환경/배포마다 다르므로 VITE_ 환경 변수로 오버라이드한다.
//   .env 예시:
//     VITE_AWS_AGENT1_NODENAME=ip-10-0-1-21
//     VITE_AWS_AGENT2_NODENAME=ip-10-0-1-22
//     VITE_AWS_AGENT3_NODENAME=ip-10-0-1-23
// 미설정 시 아래 기본값(aws-agent-N)을 사용한다.
// 주의: 브라우저 코드는 VITE_ 접두사 변수만 읽을 수 있다(서버용 AWS_AGENTx_* 는 안 읽힘).
const env = import.meta.env as Record<string, string | undefined>;

const AGENTS: AgentDef[] = [
  {
    // Cloud A: 화면 표시명은 "Cloud A", 실제 nodeName(hostname)은 cloud-01
    id: "aws-agent-1",
    label: "Cloud A",
    nodeName: env.VITE_AWS_AGENT1_NODENAME || "cloud-01",
    uri: "piccolo://aws-agent-1",
  },
  {
    // Cloud C: 화면 표시명은 "Cloud C", 실제 nodeName(hostname)은 cloud-02
    id: "aws-agent-2",
    label: "Cloud C",
    nodeName: env.VITE_AWS_AGENT2_NODENAME || "cloud-02",
    uri: "piccolo://aws-agent-2",
  },
];

// master 노드 이름(항상 표시). 폴링 데이터에서 이 이름을 master로 취급.
const MASTER_NODE_NAME = env.VITE_MASTER_NODENAME || "HPC";

const GB = 1024 * 1024 * 1024;

// 폴링으로 채워지는 노드 리소스
interface NodeResource {
  nodeName: string;
  cpuUsage: number; // %
  memoryUsage: number; // %
}

// 폴링으로 채워지는 컨테이너(pod)
interface ContainerInfo {
  name: string;
  image: string;
  node: string;
  status: string;
  memory: string;
}

const POLL_INTERVAL = Number(import.meta.env.VITE_SETTING_SERVICE_TIMEOUT || 5000);

// 구독/해지 요청 후 이 시간(ms) 안에 노드가 조인(또는 이탈)되지 않으면 실패로 처리한다.
//   .env: VITE_DEMO_SUBSCRIBE_TIMEOUT (기본 60000 = 60초)
const SUBSCRIBE_TIMEOUT = Number(
  env.VITE_DEMO_SUBSCRIBE_TIMEOUT || 60000
);

export function Demo() {
  // 각 agent 의 구독 상태
  const [states, setStates] = useState<Record<string, SubState>>({
    "aws-agent-1": "unsubscribed",
    "aws-agent-2": "unsubscribed",
    "aws-agent-3": "unsubscribed",
  });

  // 폴링으로 얻은 실제 노드/컨테이너 데이터
  const [nodeResources, setNodeResources] = useState<NodeResource[]>([]);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  // 현재 master 에 조인되어 있는 node_name 집합
  const [joinedNodes, setJoinedNodes] = useState<Set<string>>(new Set());
  // 구독/해지 실패(타임아웃 포함) 메시지. agentId -> message
  const [errors, setErrors] = useState<Record<string, string>>({});

  // agentId -> 진행 중인 타임아웃 타이머. 성공/취소 시 clear 한다.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = useCallback((agentId: string) => {
    const t = timersRef.current[agentId];
    if (t) {
      clearTimeout(t);
      delete timersRef.current[agentId];
    }
  }, []);

  // 언마운트 시 모든 타이머 정리
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((t) => clearTimeout(t));
      timersRef.current = {};
    };
  }, []);

  // ----- 폴링: 노드 리소스 -----
  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/metrics/nodes");
      const data = await res.json();
      const nodes: any[] = Array.isArray(data) ? data : [];
      const mapped: NodeResource[] = nodes.map((n) => ({
        nodeName: n.node_name,
        cpuUsage: Number((n.cpu_usage ?? 0).toFixed(1)),
        memoryUsage: Number((n.mem_usage ?? 0).toFixed(1)),
      }));
      setNodeResources(mapped);
      setJoinedNodes(new Set(mapped.map((m) => m.nodeName)));
    } catch (e) {
      console.error("[demo] fetchNodes failed:", e);
    }
  }, []);

  // ----- 폴링: 컨테이너(pod) -----
  const fetchContainers = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/metrics");
      const data = await res.json();
      const items: any[] = Array.isArray(data) ? data : [];
      const mapped: ContainerInfo[] = items
        .filter(
          (item) =>
            item.component === "container" &&
            item.metric_type === "ContainerInfo" &&
            item.value?.value
        )
        .map((item, idx) => {
          const val = item.value.value;
          let memory = "";
          if (val.stats?.MemoryUsage) {
            const memRaw = Number(val.stats.MemoryUsage);
            if (!isNaN(memRaw)) {
              memory =
                memRaw > GB
                  ? `${(memRaw / GB).toFixed(1)}GB`
                  : `${(memRaw / (1024 * 1024)).toFixed(0)}MB`;
            }
          }
          return {
            name: (val.names && val.names[0]) || val.id || `container-${idx}`,
            image: val.image || "",
            node:
              (val.state && (val.state.node_name || val.state.hostname)) ||
              val.config?.Hostname ||
              "",
            status: (val.state && (val.state.status || val.state.Status)) || "",
            memory,
          };
        })
        .filter((c) => c.status.toLowerCase() !== "exited");
      setContainers(mapped);
    } catch (e) {
      console.error("[demo] fetchContainers failed:", e);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
    fetchContainers();
    const t = setInterval(() => {
      fetchNodes();
      fetchContainers();
    }, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchNodes, fetchContainers]);

  // ----- 상태 머신 조정: 폴링 결과(joinedNodes)로 subscribing/unsubscribing 을 확정 -----
  useEffect(() => {
    setStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const agent of AGENTS) {
        const isJoined = joinedNodes.has(agent.nodeName);
        const cur = prev[agent.id];
        if (cur === "subscribing" && isJoined) {
          next[agent.id] = "subscribed";
          clearTimer(agent.id); // 조인 확인 → 타임아웃 취소
          changed = true;
        } else if (cur === "unsubscribing" && !isJoined) {
          next[agent.id] = "unsubscribed";
          clearTimer(agent.id); // 이탈 확인 → 타임아웃 취소
          changed = true;
        } else if (cur === "subscribed" && !isJoined) {
          next[agent.id] = "unsubscribed"; // 외부 요인 이탈 동기화
          changed = true;
        } else if (cur === "unsubscribed" && isJoined) {
          next[agent.id] = "subscribed"; // 외부 요인 조인 동기화
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [joinedNodes, clearTimer]);

  // ----- 구독/해지 액션 -----
  const subscribe = async (agentId: string) => {
    setErrors((e) => {
      const { [agentId]: _drop, ...rest } = e;
      return rest;
    });
    setStates((p) => ({ ...p, [agentId]: "subscribing" }));

    // 타임아웃: 제한 시간 내 노드가 조인되지 않으면 실패 처리
    clearTimer(agentId);
    timersRef.current[agentId] = setTimeout(() => {
      delete timersRef.current[agentId];
      setStates((p) =>
        p[agentId] === "subscribing" ? { ...p, [agentId]: "unsubscribed" } : p
      );
      setErrors((e) => ({
        ...e,
        [agentId]: `Connection timed out (${Math.round(
          SUBSCRIBE_TIMEOUT / 1000
        )}s). The node did not join the master.`,
      }));
    }, SUBSCRIBE_TIMEOUT);

    try {
      const res = await fetch("/demo/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
      // 확정은 폴링(fetchNodes)이 노드를 발견하면 subscribed 로 전환
    } catch (e) {
      console.error(e);
      clearTimer(agentId);
      setStates((p) => ({ ...p, [agentId]: "unsubscribed" })); // 요청 실패 시 즉시 롤백
      setErrors((prev) => ({
        ...prev,
        [agentId]: `Subscribe request failed: ${(e as Error).message}`,
      }));
    }
  };

  const unsubscribe = async (agentId: string) => {
    setErrors((e) => {
      const { [agentId]: _drop, ...rest } = e;
      return rest;
    });
    setStates((p) => ({ ...p, [agentId]: "unsubscribing" }));

    // 타임아웃: 제한 시간 내 노드가 이탈하지 않으면 실패 처리(다시 subscribed 로)
    clearTimer(agentId);
    timersRef.current[agentId] = setTimeout(() => {
      delete timersRef.current[agentId];
      setStates((p) =>
        p[agentId] === "unsubscribing" ? { ...p, [agentId]: "subscribed" } : p
      );
      setErrors((e) => ({
        ...e,
        [agentId]: `Unsubscribe timed out (${Math.round(
          SUBSCRIBE_TIMEOUT / 1000
        )}s). The node is still registered on the master.`,
      }));
    }, SUBSCRIBE_TIMEOUT);

    try {
      const res = await fetch("/demo/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      if (!res.ok) throw new Error(`unsubscribe failed: ${res.status}`);
      // 확정은 폴링이 노드 사라짐을 확인하면 unsubscribed 로 전환
    } catch (e) {
      console.error(e);
      clearTimer(agentId);
      setStates((p) => ({ ...p, [agentId]: "subscribed" })); // 요청 실패 시 즉시 롤백
      setErrors((prev) => ({
        ...prev,
        [agentId]: `Unsubscribe request failed: ${(e as Error).message}`,
      }));
    }
  };

  const toggle = (agentId: string) => {
    const s = states[agentId];
    if (s === "unsubscribed") subscribe(agentId);
    else if (s === "subscribed") unsubscribe(agentId);
    // subscribing / unsubscribing 중에는 무시(중복 요청 방지)
  };

  // ----- 표시용 파생 데이터 -----
  const nodeResByName = (name: string): NodeResource | undefined =>
    nodeResources.find((n) => n.nodeName === name);

  const containersByNode = (name: string): ContainerInfo[] =>
    containers.filter((c) => c.node === name);

  // 화면에 보여줄 노드 = master(항상) + subscribed 상태인 agent 노드
  const visibleNodes: { name: string; role: "MASTER" | "AGENT"; uri: string }[] = [
    { name: MASTER_NODE_NAME, role: "MASTER", uri: "piccolo://hpc-master:8080" },
    ...AGENTS.filter((a) => states[a.id] === "subscribed").map((a) => ({
      name: a.nodeName,
      role: "AGENT" as const,
      uri: a.uri,
    })),
  ];

  const subscribedCount = AGENTS.filter((a) => states[a.id] === "subscribed").length;
  const totalContainers = visibleNodes.reduce(
    (acc, n) => acc + containersByNode(n.name).length,
    0
  );

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="relative">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-1 h-8 bg-gradient-to-b from-primary to-primary/80 rounded-full"></div>
          <h1 className="font-bold text-foreground text-[20px]">PULLPIRI Demo</h1>
        </div>
        <p className="text-muted-foreground ml-8">
          Subscribe AWS agent nodes and monitor live resources per node
        </p>
      </div>

      {/* Cluster Overview Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Containers */}
        <Card className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 backdrop-blur-sm border-blue-200/20 dark:border-blue-800/20 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                <Box className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Containers</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {totalContainers}
                  </span>
                  <Badge className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 text-xs">
                    running
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Nodes */}
        <Card className="bg-gradient-to-r from-purple-500/10 to-purple-600/10 backdrop-blur-sm border-purple-200/20 dark:border-purple-800/20 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                <Server className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Nodes</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {visibleNodes.length}
                  </span>
                  <Badge className="bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200 text-xs">
                    HPC + {subscribedCount} AWS
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Model Subscription (AWS) */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-bold text-foreground text-base">
            AI Model Subscription (AWS)
          </h2>
          <p className="text-sm text-muted-foreground">
            Subscribe or cancel AWS agent nodes - HPC master is always monitored
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {AGENTS.map((agent) => {
            const state = states[agent.id];
            const isBusy = state === "subscribing" || state === "unsubscribing";
            const isSubscribed = state === "subscribed";
            const res = nodeResByName(agent.nodeName);
            const cCount = containersByNode(agent.nodeName).length;
            const errMsg = errors[agent.id];
            return (
              <Card
                key={agent.id}
                className={`backdrop-blur-sm shadow-lg dark:shadow-black/40 border dark:border-2 transition-all ${
                  isSubscribed
                    ? "bg-card/80 border-emerald-500/30 dark:border-emerald-500/50"
                    : "bg-card/50 dark:bg-card/90 border-border/20 dark:border-zinc-700"
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-md">
                        <Cloud className="w-5 h-5 text-white" strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {agent.label}
                        </p>
                        {isSubscribed ? (
                          <p className="text-xs text-muted-foreground">
                            {cCount} containers · CPU {res?.cpuUsage ?? 0}% · MEM{" "}
                            {res?.memoryUsage ?? 0}%
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            AI workload node available for subscription
                          </p>
                        )}
                      </div>
                    </div>
                    {isSubscribed && (
                      <Badge className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs">
                        SUBSCRIBED
                      </Badge>
                    )}
                    {isBusy && (
                      <Badge className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {state === "subscribing" ? "CONNECTING" : "DISCONNECTING"}
                      </Badge>
                    )}
                    {!isBusy && errMsg && (
                      <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        FAILED
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-xs text-muted-foreground">
                      {isSubscribed
                        ? "Subscribed"
                        : isBusy
                        ? state === "subscribing"
                          ? "Connecting…"
                          : "Disconnecting…"
                        : "Tap to subscribe"}
                    </p>
                    <Switch
                      checked={isSubscribed || state === "subscribing"}
                      disabled={isBusy}
                      onCheckedChange={() => toggle(agent.id)}
                      aria-label={`Toggle subscription for ${agent.label}`}
                    />
                  </div>
                  {isBusy && (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Waiting up to {Math.round(SUBSCRIBE_TIMEOUT / 1000)}s for the
                      node to join…
                    </p>
                  )}
                  {!isBusy && errMsg && (
                    <p className="mt-3 text-[11px] text-red-600 dark:text-red-400">
                      {errMsg}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Node Resources & Containers */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-bold text-foreground text-base">
            Node Resources &amp; Containers
          </h2>
          <p className="text-sm text-muted-foreground">
            Live CPU / MEM utilization and running containers per node
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {visibleNodes.map((node) => {
            const res = nodeResByName(node.name);
            const nodeContainers = containersByNode(node.name);
            return (
              <Card
                key={node.name}
                className="bg-card/80 backdrop-blur-sm border-border/20 shadow-xl"
              >
                <CardContent className="p-6">
                  {/* Node header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          node.role === "MASTER"
                            ? "border-2 border-gray-900 dark:border-white"
                            : "bg-orange-500 shadow-md"
                        }`}
                      >
                        {node.role === "MASTER" ? (
                          <Server className="w-5 h-5 text-gray-900 dark:text-white" strokeWidth={2.5} />
                        ) : (
                          <Cloud className="w-5 h-5 text-white" strokeWidth={2.5} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">
                            {node.name}
                          </span>
                          <Badge
                            className={`text-xs ${
                              node.role === "MASTER"
                                ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {node.role}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {node.uri}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        Ready
                      </span>
                    </div>
                  </div>

                  {/* Resource usage */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Cpu className="w-4 h-4 text-blue-500" />
                          CPU Usage
                        </span>
                        <span className="text-sm font-mono">
                          {res?.cpuUsage ?? 0}%
                        </span>
                      </div>
                      <Progress value={res?.cpuUsage ?? 0} className="h-2" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <MemoryStick className="w-4 h-4 text-pink-500" />
                          Memory Usage
                        </span>
                        <span className="text-sm font-mono">
                          {res?.memoryUsage ?? 0}%
                        </span>
                      </div>
                      <Progress value={res?.memoryUsage ?? 0} className="h-2" />
                    </div>

                    {/* Containers list */}
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Box className="w-4 h-4 text-primary" />
                        Containers
                      </span>
                      <Badge className="bg-muted text-muted-foreground text-xs">
                        {nodeContainers.length} total
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/30 divide-y divide-border/20 mt-3">
                    {nodeContainers.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No containers running on this node
                      </div>
                    ) : (
                      nodeContainers.map((c) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between p-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {c.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {c.image}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right text-xs text-muted-foreground">
                              {c.memory && <p>MEM {c.memory}</p>}
                            </div>
                            <Badge className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs">
                              {c.status || "RUNNING"}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
