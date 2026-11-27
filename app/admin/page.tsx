
"use client";

import { useEffect, useState } from "react";
import { Activity, Files, Users, Zap } from "lucide-react";
import AppShell from "@/components/app-shell";
import { apiRequest } from "@/lib/client/api";

type Usage = {
  monthlyLimitTokens: number;
  usedTokens: number;
  reservedTokens: number;
  remainingTokens: number;
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
};

type DocumentItem = {
  id: string;
  status: string;
};

type Member = {
  id: string;
};

export default function AdminPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [documentCount, setDocumentCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiRequest<ApiResponse<Usage>>("/api/usage"),
      apiRequest<ApiResponse<{ documents: DocumentItem[] }>>("/api/documents"),
      apiRequest<ApiResponse<{ members: Member[] }>>(
        "/api/organization/members",
      ),
    ])
      .then(([usageResponse, documentResponse, memberResponse]) => {
        const documents = documentResponse.data.documents ?? [];
        setUsage(usageResponse.data);
        setDocumentCount(documents.length);
        setMemberCount(memberResponse.data.members?.length ?? 0);
        setFailedCount(
          documents.filter((doc) => doc.status === "failed").length,
        );
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <h1>Admin Overview</h1>
          <p>Monitor your organization&apos;s knowledge assistant.</p>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="stats-grid">
        <Stat
          icon={<Files size={19} />}
          label="Documents"
          value={documentCount}
        />
        <Stat
          icon={<Users size={19} />}
          label="Team members"
          value={memberCount}
        />
        <Stat
          icon={<Zap size={19} />}
          label="Tokens consumed"
          value={usage?.usedTokens ?? "—"}
        />
        <Stat
          icon={<Activity size={19} />}
          label="Failed documents"
          value={failedCount ?? "—"}
        />
      </div>

      <section className="panel">
        <h2>Organization usage</h2>
        {usage ? (
          <>
            <div className="panel-row">
              <div className="row-grow">
                <div className="row-title">
                  {usage.usedTokens.toLocaleString()} /{" "}
                  {usage.monthlyLimitTokens.toLocaleString()} tokens
                </div>
                <div className="row-subtitle">
                  {usage.reservedTokens.toLocaleString()} tokens reserved
                </div>
              </div>
              <strong>
                {usage.monthlyLimitTokens
                  ? ((usage.usedTokens / usage.monthlyLimitTokens) * 100).toFixed(1)
                  : "0"}
                %
              </strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-value"
                style={{
                  width: `${
                    usage.monthlyLimitTokens
                      ? Math.min(
                          100,
                          (usage.usedTokens / usage.monthlyLimitTokens) * 100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </>
        ) : (
          <p className="muted">Loading organization usage...</p>
        )}
      </section>

      <div className="notice" style={{ background: "#f2edfb", color: "#62409b" }}>
        Advanced analytics such as top questions, user-level token reports and
        failed-job history need dedicated organization-scoped analytics
        endpoints. We will connect those after verifying the existing
        Conversation, Message and IngestionJob schemas.
      </div>
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
  value: number | string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
