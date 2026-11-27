
"use client";

import { useEffect, useState } from "react";
import { Activity, Files, Users, Zap } from "lucide-react";
import AppShell from "@/components/app-shell";
import { apiRequest } from "@/lib/client/api";

type Usage = {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
};

type DocumentItem = {
  _id: string;
  status: string;
};

type Member = {
  _id: string;
};

export default function AdminPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [documentCount, setDocumentCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiRequest<Usage>("/api/usage"),
      apiRequest<{ documents: DocumentItem[] }>("/api/documents"),
      apiRequest<{ members: Member[] }>("/api/organization/members"),
    ])
      .then(([usageData, documentData, memberData]) => {
        setUsage(usageData);
        setDocumentCount(documentData.documents?.length ?? 0);
        setMemberCount(memberData.members?.length ?? 0);
        setFailedCount(
          documentData.documents?.filter((doc) => doc.status === "failed")
            .length ?? 0,
        );
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <h1>Admin Overview</h1>
          <p>Monitor your organization's knowledge assistant.</p>
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
          value={usage?.used ?? "—"}
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
                  {usage.used.toLocaleString()} /{" "}
                  {usage.limit.toLocaleString()} tokens
                </div>
                <div className="row-subtitle">
                  {usage.reserved.toLocaleString()} tokens reserved
                </div>
              </div>
              <strong>
                {usage.limit
                  ? ((usage.used / usage.limit) * 100).toFixed(1)
                  : "0"}
                %
              </strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-value"
                style={{
                  width: `${
                    usage.limit
                      ? Math.min(100, (usage.used / usage.limit) * 100)
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
