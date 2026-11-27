"use client";

import { UserPlus, Users, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { apiRequest } from "@/lib/client/api";

type ApiResponse<T> = {
  success: boolean;
  data: T;
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt?: string;
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMembers = useCallback(async () => {
    setError("");
    try {
      const result = await apiRequest<ApiResponse<{ members: Member[] }>>(
        "/api/organization/members",
      );
      setMembers(result.data?.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function createMember(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setCreating(true);

    try {
      await apiRequest("/api/organization/members", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });

      setName("");
      setEmail("");
      setPassword("");
      setMessage("Member created successfully.");
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create member");
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <h1>Team Members</h1>
          <p>Manage members within your organization.</p>
        </div>
        <button className="button" onClick={() => void loadMembers()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {message && <div className="notice notice-success">{message}</div>}

      <div className="dashboard-grid">
        <section className="panel">
          <h2>
            <Users size={17} style={{ verticalAlign: "middle" }} /> Members (
            {members.length})
          </h2>

          {loading ? (
            <p className="muted">Loading members...</p>
          ) : members.length === 0 ? (
            <div className="empty-state">No members found.</div>
          ) : (
            members.map((member) => (
              <div className="member-row" key={member.id}>
                <div className="avatar">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="row-grow">
                  <div className="row-title">{member.name}</div>
                  <div className="row-subtitle">{member.email}</div>
                </div>
                <span className="status">{member.role}</span>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <h2>
            <UserPlus size={17} style={{ verticalAlign: "middle" }} /> Add a
            member
          </h2>

          <p className="row-subtitle">
            New members are assigned the member role by the server.
          </p>

          <form onSubmit={createMember}>
            <div className="form-field">
              <label htmlFor="member-name">Full name</label>
              <input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
              />
            </div>

            <div className="form-field">
              <label htmlFor="member-email">Email</label>
              <input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="member-password">Temporary password</label>
              <input
                id="member-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                maxLength={72}
                required
              />
            </div>

            <button
              className="button button-primary"
              type="submit"
              disabled={creating}
            >
              <UserPlus size={16} />
              {creating ? "Creating..." : "Create member"}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}