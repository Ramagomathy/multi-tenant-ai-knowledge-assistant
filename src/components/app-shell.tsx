
"use client";

import {
  BrainCircuit,
  LayoutDashboard,
  MessageSquare,
  Files,
  ChartNoAxesCombined,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client/api";

type CurrentUser = {
  id?: string;
  userId?: string;
  organizationId: string;
  role: "admin" | "member";
};

type AuthMeResponse = {
  success?: boolean;
  data?: CurrentUser | null;
  user?: CurrentUser | null;
} & Partial<CurrentUser>;

const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "AI Assistant", href: "/chat", icon: MessageSquare },
  { label: "Documents", href: "/documents", icon: Files },
  { label: "Usage & Quota", href: "/usage", icon: ChartNoAxesCombined },
  { label: "Team Members", href: "/team", icon: Users },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    apiRequest<AuthMeResponse>("/api/auth/me")
      .then((result) => {
        if (!active) return;

        const candidate = result?.data ?? result?.user ?? result;
        const resolvedId = candidate?.userId ?? candidate?.id;

        if (resolvedId && candidate?.organizationId && candidate?.role) {
          setUser({
            id: resolvedId,
            userId: resolvedId,
            organizationId: candidate.organizationId,
            role: candidate.role,
          });
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        if (active) router.replace("/login");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function logout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  if (loading) {
    return (
      <div className="screen-loader">
        <div className="loader-spinner" />
        <p>Loading your workspace...</p>
      </div>
    );
  }

  if (!user) return null;

  const links = [
    ...navigation,
    ...(user.role === "admin"
      ? [{ label: "Admin Overview", href: "/admin", icon: ShieldCheck }]
      : []),
  ];

  return (
    <div className="app-layout">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">
            <BrainCircuit size={22} />
          </div>
          <span>KnowBase</span>
          <button
            className="mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          {links.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/"));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="avatar">
              {user.role === "admin" ? "A" : "M"}
            </div>
            <div className="user-details">
              <strong>{user.role === "admin" ? "Administrator" : "Member"}</strong>
              <span>{user.role}</span>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="sidebar-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>

          <div className="topbar-title">Knowledge Workspace</div>

          <div className="topbar-right">
            <span className="online-indicator" />
            <span className="online-label">Workspace active</span>
          </div>
        </header>

        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
