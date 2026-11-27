"use client";

import {
  Files,
  Zap,
  MessageSquare,
  Gauge,
  ArrowUpRight,
  FileText,
  File,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { apiRequest } from "@/lib/client/api";

type Usage = {
  limit?: number;
  used?: number;
  reserved?: number;
  remaining?: number;
  periodKey?: string;
};

type DocumentItem = {
  _id: string;
  originalName: string;
  status: string;
  createdAt: string;
};

export default function DashboardPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiRequest<Usage>("/api/usage"),
      apiRequest<{ documents: DocumentItem[] }>("/api/documents"),
    ])
      .then(([usageData, documentData]) => {
        setUsage(usageData);
        setDocuments(documentData.documents ?? []);
      })
      .catch((err) => setError(err.message));
  }, []);

  const used = usage?.used ?? 0;
  const limit = usage?.limit ?? 0;
  const reserved = usage?.reserved ?? 0;
  const remaining = usage?.remaining ?? 0;

  const percentage = limit ? Math.min(100, (used / limit) * 100) : 0;

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your organization's knowledge workspace.</p>
        </div>
        <Link href="/chat" className="button button-primary">
          <MessageSquare size={17} />
          Start a conversation
        </Link>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="stats-grid">
        <StatCard
          icon={<Files size={19} />}
          label="Documents"
          value={documents.length.toString()}
        />
        <StatCard
          icon={<Zap size={19} />}
          label="Tokens used"
          value={usage ? used.toLocaleString() : "—"}
        />
        <StatCard
          icon={<MessageSquare size={19} />}
          label="Conversations"
          value="—"
        />
        <StatCard
          icon={<Gauge size={19} />}
          label="Remaining quota"
          value={usage ? remaining.toLocaleString() : "—"}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h2>Monthly token usage</h2>

          {usage ? (
            <>
              <div className="panel-row">
                <div className="row-grow">
                  <div className="row-title">
                    {used.toLocaleString()} used
                  </div>
                  <div className="row-subtitle">
                    Monthly limit: {limit.toLocaleString()}
                  </div>
                </div>
                <strong>{percentage.toFixed(1)}%</strong>
              </div>

              <div className="progress-track">
                <div
                  className="progress-value"
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <p className="row-subtitle">
                {reserved.toLocaleString()} tokens currently reserved.
              </p>
            </>
          ) : (
            <p className="muted">Loading usage...</p>
          )}

          <Link href="/usage" className="button" style={{ marginTop: 18 }}>
            View usage details <ArrowUpRight size={16} />
          </Link>
        </section>

        <section className="panel">
          <div className="panel-row" style={{ paddingTop: 0 }}>
            <div className="row-grow">
              <h2 style={{ margin: 0 }}>Recent documents</h2>
            </div>
            <Link href="/documents" className="muted">
              View all
            </Link>
          </div>

          {documents.length === 0 ? (
            <div className="empty-state">
              <Files size={28} />
              <p>No documents uploaded yet.</p>
              <Link href="/documents" className="button button-primary">
                Upload a document
              </Link>
            </div>
          ) : (
            documents.slice(0, 5).map((document) => (
              <div className="panel-row" key={document._id}>
                {document.originalName.toLowerCase().endsWith(".pdf") ? (
                  <File size={19} color="#dc5656" />
                ) : (
                  <FileText size={19} color="#7c3aed" />
                )}
                <div className="row-grow">
                  <div className="row-title">{document.originalName}</div>
                  <div className="row-subtitle">
                    {new Date(document.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className={`status status-${document.status}`}>
                  {document.status}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}