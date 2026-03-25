// SPDX-FileCopyrightText: Copyright 2024 LG Electronics Inc.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

interface LogEntry {
  timestamp: string;
  level: string;
  tag: string;
  message: string;
}

const TAG_FILTERS = [
  { key: "actioncontroller", label: "ACTION CONTROLLER" },
  { key: "filtergateway", label: "FILTER GATEWAY" },
  { key: "statemanager", label: "STATE MANAGER" },
  { key: "apiserver", label: "API SERVER" },
  { key: "monitoringserver", label: "MONITORING SERVER" },
  { key: "policymanager", label: "POLICY MANAGER" },
  { key: "settingsservice", label: "SETTINGS SERVICE" },
  { key: "resourcemanager", label: "RESOURCE MANAGER" },
];

export function LogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [enabledTags, setEnabledTags] = useState<Set<string>>(
    new Set(TAG_FILTERS.map((f) => f.key))
  );
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to the pullpiri log service via Server-Sent Events
    // Using Vite proxy to avoid CORS issues
    const eventSource = new EventSource("/logs");
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const logEntry: LogEntry = JSON.parse(event.data);
        console.log("📝 Received log entry:", logEntry);
        setLogs((prev) => {
          const newLogs = [logEntry, ...prev];
          // Keep only the last 2000 logs
          return newLogs.slice(0, 2000);
        });
      } catch (error) {
        console.error("Failed to parse log entry:", error, "Raw data:", event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      // EventSource will automatically reconnect
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Auto-scroll to show latest logs on top (already at top)
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs]);

  const toggleTag = (tag: string) => {
    setEnabledTags((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  };

  const filteredLogs = logs.filter((log) => enabledTags.has(log.tag));

  const getLevelColor = (level: string) => {
    switch (level) {
      case "V":
        return "text-slate-400";
      case "D":
        return "text-blue-400";
      case "I":
        return "text-emerald-400";
      case "W":
        return "text-amber-400";
      case "E":
      case "F":
        return "text-red-400";
      default:
        return "text-slate-400";
    }
  };

  return (
    <Card className="bg-[#050914] border-[#1f2a44] shadow-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col" style={{ height: "600px" }}>
          {/* Header */}
          <div className="flex-none bg-gradient-to-b from-[#0f172a] to-[#050914]">
            <div className="w-full min-w-[1000px]">
              <div className="px-6 py-8 pb-6">
                <h1 className="text-3xl font-bold text-[#e2e8f0] mb-6 tracking-tight">
                  PULLPIRI LOG STREAM
                </h1>

                {/* Filter Buttons */}
                <div className="flex gap-2 mt-6">
                  {TAG_FILTERS.map((filter) => (
                    <Button
                      key={filter.key}
                      variant="outline"
                      size="sm"
                      onClick={() => toggleTag(filter.key)}
                      className={`flex-1 h-9 px-2 text-[10px] font-mono tracking-wide border-2 transition-all duration-200 whitespace-nowrap ${
                        enabledTags.has(filter.key)
                          ? "bg-emerald-500 border-emerald-400 text-white font-bold hover:bg-emerald-600 shadow-lg dark:bg-white dark:border-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
                          : "bg-black border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Log Table */}
          <div
            ref={logContainerRef}
            className="flex-1 overflow-y-auto overflow-x-auto bg-[#0f172a]"
            style={{ scrollBehavior: "smooth" }}
          >
            <div className="w-full min-w-[1000px]">
              {/* Table Header */}
              <div className="sticky top-0 z-10 bg-[#0f172a] border-b border-[#1f2a44]">
                <div className="grid grid-cols-12 gap-2 px-6 py-3 text-xs font-mono tracking-wide text-[#64748b] uppercase" style={{ display: 'grid', gridTemplateColumns: '25% 8% 17% 50%' }}>
                  <div className="col-span-3">Timestamp</div>
                  <div className="col-span-1">LV</div>
                  <div className="col-span-2">Tag</div>
                  <div className="col-span-6">Message</div>
                </div>
              </div>

              {/* Table Body */}
              <div className="px-6">
                {filteredLogs.length === 0 ? (
                  <div className="py-12 text-center text-[#64748b] text-sm">
                    {logs.length === 0
                      ? "Waiting for log data..."
                      : "No logs match the selected filters"}
                  </div>
                ) : (
                  filteredLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 py-3 border-b border-dashed border-[#17203a] text-sm font-mono"
                      style={{ display: 'grid', gridTemplateColumns: '25% 8% 17% 50%' }}
                    >
                      <div className="col-span-3 text-[#94a3b8] truncate">
                        {log.timestamp}
                      </div>
                      <div
                        className={`col-span-1 font-bold ${getLevelColor(
                          log.level
                        )}`}
                      >
                        {log.level}
                      </div>
                      <div className="col-span-2 text-[#7dd3fc] truncate">
                        {log.tag}
                      </div>
                      <div className="col-span-6 text-[#cbd5e1] break-words">
                        {log.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
