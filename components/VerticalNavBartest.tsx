"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { resourceUrl } from "@/src/lib/resource-schema";
import "./VerticalNavBar.css";

type NavItem = {
  href: string;
  label: string;
  kicker?: string;
  roles?: string[];
};

const portfolioItems: NavItem[] = [
  { href: "/", label: "Home", kicker: "Index" },
  { href: "/docs", label: "Deployment notes", kicker: "Docs" },
  { href: "/ops/secrets", label: "Secret status", kicker: "Ops" },
  { href: "/cms/media", label: "Media CMS", kicker: "Assets" },
  { href: "/docs", label: "Docs", kicker: "Notes" },
  { href: "https://github.com/tabeeb09/Print-Farm", label: "Source repository", kicker: "GitHub" },
];

const accountItems: NavItem[] = [
  { href: "/cms/media", label: "Media CMS", kicker: "RustFS" },
  { href: "/admin/role-requests", label: "Role requests", kicker: "Identity", roles: ["owner"] },
  {
    href: "/admin/config-requests",
    label: "Config requests",
    kicker: "CAId",
    roles: ["owner", "config_admin"],
  },
  {
    href: "/admin/logs",
    label: "Audit logs",
    kicker: "Logging",
    roles: ["owner", "audit_admin", "logging_admin"],
  },
  { href: "/ops/secrets", label: "Secret status", kicker: "Ops", roles: ["owner", "config_admin"] },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname || href.startsWith("http")) {
    return false;
  }

  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function hasRole(userRoles: string[], required?: string[]) {
  return !required?.length || required.some((role) => userRoles.includes(role));
}

export default function VerticalNavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const roles = session?.user?.roles ?? [];

  return (
    <aside className={`nav-container${collapsed ? " nav-collapsed" : ""}`}>
      <div className="nav-top">
        <button
          className="nav-hamburger"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span />
        </button>
        {!collapsed ? (
          <a href="/" className="nav-mark">
            <img src={resourceUrl("icon.home")} alt="" />
            <span>
              <strong>Print Farm</strong>
              <small>Deployment simulation</small>
            </span>
          </a>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="nav-scroll">
          <section className="nav-section">
            <p className="nav-section-title">Project</p>
            {portfolioItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`nav-link${isActive(pathname, item.href) ? " active" : ""}`}
              >
                <span>{item.label}</span>
                {item.kicker ? <small>{item.kicker}</small> : null}
              </a>
            ))}
          </section>

          <section className="nav-section nav-account">
            <p className="nav-section-title">Account</p>
            {status === "loading" ? (
              <p className="nav-muted">Checking session...</p>
            ) : session ? (
              <>
                <div className="nav-user-card">
                  <strong>{session.user?.name || session.user?.email || "Signed in"}</strong>
                  <small>{session.user?.email}</small>
                  <span>{roles.length ? roles.join(", ") : "viewer pending"}</span>
                </div>
                {accountItems
                  .filter((item) => hasRole(roles, item.roles))
                  .map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className={`nav-link${isActive(pathname, item.href) ? " active" : ""}`}
                    >
                      <span>{item.label}</span>
                      {item.kicker ? <small>{item.kicker}</small> : null}
                    </a>
                  ))}
                <button className="nav-action" type="button" onClick={() => signOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p className="nav-muted">Sign in to request roles or manage media.</p>
                <button className="nav-action" type="button" onClick={() => signIn()}>
                  Sign in
                </button>
                <a className="nav-link" href="/api/auth/keycloak-register">
                  <span>Create account</span>
                  <small>Keycloak</small>
                </a>
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="nav-collapsed-bar">
          <a href="/" aria-label="Home">
            <img src={resourceUrl("icon.home")} alt="" />
          </a>
          <a href="/cv" aria-label="CV">
            <img src={resourceUrl("icon.page")} alt="" />
          </a>
        </div>
      )}
    </aside>
  );
}
