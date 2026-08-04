// SPDX-FileCopyrightText: Copyright 2024 LG Electronics Inc.
// SPDX-License-Identifier: Apache-2.0
import { Shield } from "lucide-react";
import { Card } from "./ui/card";

/**
 * Policy tab.
 *   Shows a fixed, hard-coded policy text (not fetched from any backend).
 *   To edit the policy, update the POLICY_SECTIONS array below.
 */

interface PolicySection {
  title: string;
  paragraphs: string[];
}

// -------------------------------------------------------------------------
// Edit the policy content here. Each section renders as a heading + text.
// -------------------------------------------------------------------------
const POLICY_SECTIONS: PolicySection[] = [
  {
    title: "1. Overview",
    paragraphs: [
      "This page describes our operating policy. Replace this placeholder text with the actual policy content.",
    ],
  },
  {
    title: "2. Scope",
    paragraphs: [
      "Describe the scope this policy applies to.",
      "You can add multiple paragraphs per section.",
    ],
  },
  {
    title: "3. Details",
    paragraphs: [
      "Add the detailed policy statements here.",
    ],
  },
];

export function Policy() {
  return (
    <div className="h-full space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-md">
          <Shield className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Policy</h1>
          <p className="text-sm text-muted-foreground">
            Our operating policy
          </p>
        </div>
      </div>

      {/* Policy content */}
      <Card className="p-6 bg-card/80 backdrop-blur-sm border border-border/40 shadow-lg">
        <div className="space-y-6">
          {POLICY_SECTIONS.map((section, idx) => (
            <section key={idx} className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">
                {section.title}
              </h2>
              {section.paragraphs.map((p, pIdx) => (
                <p
                  key={pIdx}
                  className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
