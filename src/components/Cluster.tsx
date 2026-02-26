// SPDX-FileCopyrightText: Copyright 2024 LG Electronics Inc.
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Progress } from "./ui/progress";
import {
  Search,
  MoreHorizontal,
  Plus,
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
} from "lucide-react";

export function Cluster() {
  const [searchTerm, setSearchTerm] = useState("");

  // Mock data
  // nodes fetched from settingsservice
  const [nodesDataToUse, setNodesDataToUse] = useState<any[]>([]);
  const [nodesFetchSuccess, setNodesFetchSuccess] = useState(false);
  const [nodesFetchError, setNodesFetchError] = useState<string | null>(null);

  useEffect(() => {
    const settingserviceApiUrl = import.meta.env.VITE_SETTING_SERVICE_API_URL;
    const endpoint = settingserviceApiUrl
      ? `${settingserviceApiUrl.replace(/\/+$/, "")}/api/v1/nodes`
      : "/api/v1/nodes";

    const fetchNodes = async () => {
      setNodesFetchError(null);
      const tryRelative = async () => {
        // Try the metrics path first (Workloads uses /api/v1/metrics/nodes)
        const candidates = [
          "/api/v1/metrics/nodes",
          "/api/v1/nodes",
        ];
        for (const path of candidates) {
          try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
          } catch (e) {
            console.debug(`Relative ${path} fetch failed:`, e);
            // try next
          }
        }
        throw new Error("All relative node endpoints failed");
      };

      const tryAbsolute = async () => {
        if (!endpoint) throw new Error("No endpoint configured");
        try {
          const res = await fetch(endpoint);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e) {
          console.debug("Absolute settingsservice fetch failed:", e);
          throw e;
        }
      };

      let data: any = null;
      try {
        // Prefer relative path (dev proxy or same-origin)
        data = await tryRelative();
      } catch (eRel) {
        // If relative failed, try absolute (explicit settingservice URL)
        try {
          data = await tryAbsolute();
        } catch (eAbs) {
          const msg = (eAbs && (eAbs as Error).message) || String(eAbs || eRel);
          console.error("Nodes fetch failed:", eAbs || eRel);
          setNodesFetchError(msg);
          setNodesFetchSuccess(false);
          setNodesDataToUse([]);
          return;
        }
      }

      // Normalize response shape
      let nodes: any[] = [];
      if (Array.isArray(data)) nodes = data;
      else if (data && Array.isArray((data as any).nodes)) nodes = (data as any).nodes;
      else {
        setNodesFetchError("Unexpected response shape from nodes API");
        setNodesFetchSuccess(false);
        setNodesDataToUse([]);
        return;
      }

      if (nodes.length > 0) {
        const normalized = nodes.map((n) => ({
          ...n,
          cpu_usage: typeof n.cpu_usage === "number" ? n.cpu_usage : Number(n.cpu_usage) || 0,
          cpu_count: typeof n.cpu_count === "number" ? n.cpu_count : Number(n.cpu_count) || 0,
          used_memory: typeof n.used_memory === "number" ? n.used_memory : Number(n.used_memory) || 0,
          total_memory: typeof n.total_memory === "number" ? n.total_memory : Number(n.total_memory) || 0,
          mem_usage: typeof n.mem_usage === "number" ? n.mem_usage : Number(n.mem_usage) || 0,
        }));
        setNodesDataToUse(normalized);
        setNodesFetchSuccess(true);
      } else {
        setNodesFetchSuccess(false);
        setNodesDataToUse([]);
      }
    };

    fetchNodes();
    const interval = setInterval(fetchNodes, import.meta.env.VITE_SETTING_SERVICE_TIMEOUT || 5000);
    return () => clearInterval(interval);
  }, []);

  const GB = 1024 * 1024 * 1024;
  const nodes = nodesFetchSuccess
    ? nodesDataToUse.map((node: any) => ({
        name: node.node_name,
        internalIP: node.ip || node.internal_ip || "",
        os: node.os || "",
        arch: node.arch || "",
  // Use raw values from API: cpu_usage and mem_usage
  cpuUsage: node.cpu_usage ?? 0,
  memoryUsage: node.mem_usage ?? 0,
  totalStorage: node.total_storage || node.storage_total || 0,
        storageUsage: node.storage_usage || node.used_storage || 0,
  // pods removed from this table per request
      }))
    : [];



  const filteredNodes = nodes.filter((node) =>
    node.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="relative">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-1 h-8 bg-gradient-to-b from-primary to-primary/80 rounded-full"></div>
            <h1 className="font-bold text-foreground text-[20px]">
              PULLPIRI Nodes
            </h1>
          </div>
          <p className="text-muted-foreground ml-8">
            Monitor and manage your cluster nodes infrastructure
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/80 text-primary-foreground shadow-lg hover:shadow-xl transition-all gap-2">
          <Plus className="w-4 h-4" />
          Add Node
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12 bg-card/80 backdrop-blur-sm border-border/30 shadow-sm hover:shadow-md transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 px-3 py-1">
            <Server className="w-3 h-3 mr-1" />
            {nodes.length} Nodes
          </Badge>
        </div>
      </div>

      {/* Nodes Table */}
      <Card className="bg-card/80 backdrop-blur-sm border-border/20 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Server className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-foreground">
                Nodes
              </CardTitle>
              <CardDescription>
                Physical and virtual machines in your cluster
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            <div className="overflow-hidden rounded-xl border border-border/30">
              {nodesFetchError && (
                <div className="p-3 text-sm text-yellow-700 bg-yellow-50 border-b border-yellow-100">
                  Nodes fetch error: {nodesFetchError}
                </div>
              )}
            <Table>
              <TableHeader className="bg-muted/80">
                <TableRow className="border-border/30">
                  <TableHead className="font-semibold text-foreground">
                    Name
                  </TableHead>
                  <TableHead className="font-semibold text-foreground">
                    OS
                  </TableHead>
                  <TableHead className="font-semibold text-foreground">
                    Arch
                  </TableHead>
                  <TableHead className="font-semibold text-foreground">
                    Internal IP
                  </TableHead>
                    <TableHead className="font-semibold text-foreground">CPU Usage</TableHead>
                    <TableHead className="font-semibold text-foreground">Memory Usage</TableHead>
                  <TableHead className="font-semibold text-foreground">Storage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNodes.map((node) => (
                  <TableRow
                    key={node.name}
                    className="border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="font-medium text-foreground">
                      {node.name}
                    </TableCell>
                    <TableCell className="text-sm">
                      {node.os}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {node.arch}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {node.internalIP}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{typeof node.cpuUsage === 'number' ? node.cpuUsage.toFixed(2) : String(node.cpuUsage)}</span>
                        <div className="w-24">
                          <Progress value={Math.min(100, Math.max(0, Number(node.cpuUsage) || 0))} className="h-2" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{typeof node.memoryUsage === 'number' ? node.memoryUsage.toFixed(2) : String(node.memoryUsage)}</span>
                        <div className="w-36">
                          <Progress value={Math.min(100, Math.max(0, Number(node.memoryUsage) || 0))} className="h-2" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {node.totalStorage && node.totalStorage > 0
                        ? `${(node.storageUsage / GB).toFixed(1)}Gi / ${(node.totalStorage / GB).toFixed(1)}Gi`
                        : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}