import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { Fragment, useEffect, useState } from "react";

import { menuItems } from "../lib/layoutData";
import styles from "../styles/Home.module.css";

const DEV_SUPERADMIN_EMAILS = ["tabeebrahman.logistics@gmail.com"];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function childGroups(groups, parentId = null) {
  return groups
    .filter((group) => (group.parentId || null) === (parentId || null))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function InventorySidebarTree({ groups, router, parentId = null, depth = 0 }) {
  const children = childGroups(groups, parentId);
  if (!children.length) return null;

  return (
    <div className={styles.navTree} style={{ "--tree-depth": depth }}>
      {children.map((group) => (
        <Fragment key={group.id}>
          <Link
            href={{ pathname: "/admin/assets/inventory", query: { groupId: group.id } }}
            className={`${styles.navTreeLink} ${router.query.groupId === group.id ? styles.navTreeLinkActive : ""}`}
          >
            {group.name}
          </Link>
          <InventorySidebarTree groups={groups} router={router} parentId={group.id} depth={depth + 1} />
        </Fragment>
      ))}
    </div>
  );
}

export default function SiteShell({ children, title = "3D Printer" }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [hasDelegatedPeopleAdmin, setHasDelegatedPeopleAdmin] = useState(false);
  const [inventoryTree, setInventoryTree] = useState(null);
  const activeSession = session?.expired || !session?.user ? null : session;
  const roles = Array.isArray(activeSession?.user?.roles)
    ? activeSession.user.roles.map(normalizeRole).filter(Boolean)
    : [];
  const userEmail = normalizeEmail(activeSession?.user?.email);
  const isSuperadmin =
    Boolean(activeSession?.user?.isSuperadmin) || DEV_SUPERADMIN_EMAILS.includes(userEmail);
  const isQueueAdmin =
    isSuperadmin ||
    ["owner", "technician", "print_admin"].some((role) => roles.includes(role));
  const isOpenBaoAdmin =
    isSuperadmin ||
    ["owner", "openbao_admin", "infra_admin"].some((role) => roles.includes(role));
  const isHrAdmin =
    isSuperadmin ||
    ["owner", "identity_hr_manager"].some((role) => roles.includes(role)) ||
    roles.some((role) => role.endsWith("_grant") || role.endsWith("_grant_super"));
  const canOpenPeopleAdmin = isHrAdmin || hasDelegatedPeopleAdmin;
  const isAssetAdmin =
    isSuperadmin ||
    ["owner", "asset_admin"].some((role) => roles.includes(role));
  const isAnyAdmin = isQueueAdmin || isOpenBaoAdmin || isHrAdmin || isAssetAdmin;
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.adminAnyOnly) return isAnyAdmin;
    if (item.openBaoAdminOnly) return isOpenBaoAdmin;
    if (item.peopleAdminOnly) return canOpenPeopleAdmin;
    if (item.hrAdminOnly) return isHrAdmin;
    if (item.assetAdminOnly) return isAssetAdmin;
    if (item.adminOnly) return isQueueAdmin;
    return true;
  });

  useEffect(() => {
    let cancelled = false;

    async function checkDelegatedPeopleAdmin() {
      if (!activeSession || isHrAdmin) {
        setHasDelegatedPeopleAdmin(false);
        return;
      }

      try {
        const response = await fetch("/api/admin/people/groups");
        if (!response.ok) {
          if (!cancelled) setHasDelegatedPeopleAdmin(false);
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          setHasDelegatedPeopleAdmin(Array.isArray(payload.groups) && payload.groups.length > 0);
        }
      } catch {
        if (!cancelled) setHasDelegatedPeopleAdmin(false);
      }
    }

    checkDelegatedPeopleAdmin();

    return () => {
      cancelled = true;
    };
  }, [isHrAdmin, activeSession?.user?.email]);

  useEffect(() => {
    let cancelled = false;

    async function loadInventoryTree() {
      if (!activeSession || !isAssetAdmin || collapsed) {
        setInventoryTree(null);
        return;
      }

      try {
        const response = await fetch("/api/assets?view=inventory-tree");
        if (!response.ok) {
          if (!cancelled) setInventoryTree(null);
          return;
        }

        const payload = await response.json();
        if (!cancelled) setInventoryTree(payload.tree || null);
      } catch {
        if (!cancelled) setInventoryTree(null);
      }
    }

    loadInventoryTree();

    return () => {
      cancelled = true;
    };
  }, [collapsed, isAssetAdmin, activeSession?.user?.email]);

  async function handleSignOut() {
    const logoutUrl = activeSession?.keycloakLogoutUrl;
    const provider = activeSession?.provider;

    if (provider === "keycloak" && logoutUrl) {
      await signOut({ redirect: false, callbackUrl: "/" });
      window.location.assign(logoutUrl);
      return;
    }

    await signOut({ callbackUrl: "/" });
  }

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ""}`}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>
        <div className={styles.sidebarTop}>
          <button
            className={styles.hamburger}
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span />
          </button>

          {!collapsed ? (
            <Link href="/" className={styles.brand}>
              <img
                className={styles.brandLogo}
                src="/makerspace-design/assets/footer-logo.png"
                alt=""
                aria-hidden="true"
              />
              <span className={styles.brandCopy}>
                <strong>Bath Makerspace</strong>
                <small>Print portal</small>
              </span>
            </Link>
          ) : null}
        </div>

        {!collapsed ? (
          <nav className={styles.navSection} aria-label="Sidebar navigation">
            <p className={styles.navTitle}>Menu</p>
            {visibleMenuItems.map((item) => (
              <Fragment key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.navLink} ${router.pathname === item.href ? styles.navLinkActive : ""}`}
                >
                  <span>{item.title}</span>
                  <small>{item.label}</small>
                </Link>
                {item.href === "/admin/assets/inventory" && inventoryTree?.groups?.length ? (
                  <div className={styles.navTreeWrap}>
                    <Link
                      href="/admin/assets/inventory"
                      className={`${styles.navTreeRoot} ${router.pathname === "/admin/assets/inventory" && !router.query.groupId ? styles.navTreeLinkActive : ""}`}
                    >
                      Inventory root
                    </Link>
                    <InventorySidebarTree groups={inventoryTree.groups} router={router} />
                  </div>
              ) : null}
            </Fragment>
          ))}
          {activeSession ? (
            <button type="button" className={`${styles.navLink} ${styles.navActionLink}`} onClick={handleSignOut}>
              <span>Sign out</span>
              <small>End this session</small>
            </button>
          ) : null}
          </nav>
        ) : (
          <div className={styles.collapsedRail}>
            <Link href="/" aria-label="Home" className={styles.collapsedIcon}>
              <img src="/makerspace-design/assets/footer-logo.png" alt="" aria-hidden="true" />
            </Link>
          </div>
        )}
      </aside>

      <header className={styles.header}>
        <Link href="/" className={styles.headerTitle}>
          {title}
        </Link>
        <div className={styles.headerActions}>
          {activeSession ? (
            <>
              <span className={styles.headerUser}>{activeSession.user?.email ?? "Signed in"}</span>
              <button type="button" className={styles.signInButton} onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.signInButton}
              onClick={() => router.push(`/auth/signin?callbackUrl=${encodeURIComponent(router.asPath || "/")}`)}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <span>Bath Makerspace print portal</span>
      </footer>
    </div>
  );
}
