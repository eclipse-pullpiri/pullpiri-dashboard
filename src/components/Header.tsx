// SPDX-FileCopyrightText: Copyright 2024 LG Electronics Inc.
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { RefreshCw, /*Bell, */User, Search, Command, Sun, Moon } from "lucide-react";  // 2025-09-23 comment out
import { Input } from "./ui/input";
import { useTheme } from "./ThemeProvider";
//import { useClusterHealth } from "./ui/use-cluster-health"; // 2025-09-23 comment out

interface Pod {
  name: string;
  image: string;
  labels: Record<string, string>;
  node: string;
  status: string;
  cpuUsage: string;
  memoryUsage: string;
  age: string;
  ready: string;
  restarts: number;
  ip: string;
}

interface HeaderProps {
  compact?: boolean;
  mobile?: boolean;
  podCount?: number;
  pods: Pod[];
}

export function Header({ compact = false, mobile = false, podCount/*, pods */}: HeaderProps) { // 2025-09-23 comment out
  const { theme, toggleTheme } = useTheme();
  //const clusterHealth = useClusterHealth(pods); // 2025-09-23 comment out
//  const [demoMode, setDemoMode] = useState(false);
//  const [dashboardIP, setDashboardIP] = useState("192.168.1.10");

//  const handleDemoToggle = async () => {
//    const newDemoMode = !demoMode;
//    setDemoMode(newDemoMode);

//  };

  if (mobile) {
    return (
      <header className="h-16 bg-card/60 backdrop-blur-xl border-b border-border shadow-lg px-4 flex items-center justify-between relative">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-muted/10 to-muted/20 dark:from-muted/5 dark:to-muted/10"></div>

	<div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex items-center gap-2 lg:gap-4 z-10">          
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-8 h-8 rounded-lg bg-card/60 hover:bg-card/80"
            onClick={toggleTheme}
          >
            {theme === 'light' ? (
              <Moon className="w-3 h-3" />
            ) : (
              <Sun className="w-3 h-3" />
            )}
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 rounded-lg bg-primary hover:bg-primary/80">
            <User className="w-3 h-3 text-primary-foreground" />
          </Button>
        </div>
      </header>
    );
  }

  const headerHeight = mobile ? "h-16" : compact ? "h-16" : "h-20";
  const paddingX = mobile ? "px-4" : compact ? "px-6" : "px-8";

  return (
    <header className={`${headerHeight} bg-card/60 backdrop-blur-xl border-b border-border shadow-lg ${paddingX} flex items-center justify-between relative`}>
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-muted/10 to-muted/20 dark:from-muted/5 dark:to-muted/10"></div>
      
      <div className="flex-1" />
      <div className="flex items-center gap-2 lg:gap-4 relative z-10 ml-auto">
        <Button 
          variant="ghost" 
          size="sm" 
          className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-card/60 hover:bg-card/80 hover:shadow-md transition-all`}
          onClick={toggleTheme}
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </Button>
        <Button variant="ghost" size="sm" className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-card/60 hover:bg-card/80 hover:shadow-md transition-all hidden sm:flex`}>
          <RefreshCw className="w-4 h-4" />
        </Button>

        <Button variant="ghost" size="sm" className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-card/60 hover:bg-card/80 hover:shadow-md transition-all`}>
          <User className="w-4 h-4 text-primary-foreground" />
        </Button>
      </div>
    </header>
  );
}