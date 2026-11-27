
"use client";

import { Activity, Gauge, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { apiRequest } from "@/lib/client/api";

type Usage = {
  monthlyLimitTokens: number;
  usedTokens: number;
  reservedTokens: number;
  remainingTokens: number;
  periodKey: string;
};

type UsageResponse = {
  success: boolean;
  data: Usage;
};

export default function UsagePage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<UsageResponse>("/api/usage")
      .then((response) => setUsage(response.data))
      .catch((err) => setError(err.message));
  }, []);

  const percent =
    usage && usage.monthlyLimitTokens > 0
      ? Math.min(100, (usage.usedTokens / usage.monthlyLimitTokens) * 100)
      : 0;

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <h1>Usage & Quota</h1>
          <p>Monitor your organization&apos;s monthly token consumption.</p>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {usage ? (
        <>
          <div className="stats-grid">
            <Stat
              icon={<Gauge size={19} />}
              label="Monthly limit"
              value={usage.monthlyLimitTokens}
            />
            <Stat
              icon={<Zap size={19} />}
              label="Tokens used"
              value={usage.usedTokens}
            />
            <Stat
              icon={<Activity size={19} />}
              label="Reserved tokens"
              value={usage.reservedTokens}
            />
            <Stat
              icon={<ShieldCheck size={19} />}
              label="Remaining tokens"
              value={usage.remainingTokens}
            />
          </div>

          <section className="panel">
            <h2>Quota consumption</h2>
            <div className="panel-row">
              <div className="row-grow">
                <div className="row-title">{percent.toFixed(1)}% consumed</div>
                <div className="row-subtitle">
                  Billing period: {usage.periodKey}
                </div>
              </div>
              <strong>
                {usage.usedTokens.toLocaleString()} /{" "}
                {usage.monthlyLimitTokens.toLocaleString()}
              </strong>
            </div>

            <div className="progress-track">
              <div
                className="progress-value"
                style={{ width: `${percent}%` }}
              />
            </div>

            <p className="row-subtitle">
              Reserved tokens are temporarily held for in-progress requests.
            </p>
          </section>
        </>
      ) : (
        !error && <p className="muted">Loading quota information...</p>
      )}
    </AppShell>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value.toLocaleString()}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
