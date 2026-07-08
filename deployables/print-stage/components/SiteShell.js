import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useState } from "react";

import { menuItems } from "../lib/layoutData";
import styles from "../styles/Home.module.css";

export default function SiteShell({ children, title = "3D Printer" }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const roles = session?.user?.roles ?? [];
  const isQueueAdmin =
    session?.user?.email?.toLowerCase?.() === "tabeebrahman.logistics@gmail.com" ||
    ["owner", "technician", "print_admin"].some((role) => roles.includes(role));
  const isOpenBaoAdmin =
    session?.user?.email?.toLowerCase?.() === "tabeebrahman.logistics@gmail.com" ||
    ["owner", "openbao_admin", "infra_admin"].some((role) => roles.includes(role));
  const isHrAdmin =
    session?.user?.email?.toLowerCase?.() === "tabeebrahman.logistics@gmail.com" ||
    ["owner", "identity_hr_manager"].some((role) => roles.includes(role));
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.openBaoAdminOnly) return isOpenBaoAdmin;
    if (item.hrAdminOnly) return isHrAdmin;
    if (item.adminOnly) return isQueueAdmin;
    return true;
  });

  async function handleSignOut() {
    const logoutUrl = session?.keycloakLogoutUrl;
    const provider = session?.provider;

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
              <span className={styles.brandMark}>3D</span>
              <span className={styles.brandCopy}>
                <strong>3D Printer</strong>
                <small>Print portal</small>
              </span>
            </Link>
          ) : null}
        </div>

        {!collapsed ? (
          <nav className={styles.navSection} aria-label="Sidebar navigation">
            <p className={styles.navTitle}>Menu</p>
            {visibleMenuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${router.pathname === item.href ? styles.navLinkActive : ""}`}
              >
                <span>{item.title}</span>
                <small>{item.label}</small>
              </Link>
            ))}
          </nav>
        ) : (
          <div className={styles.collapsedRail}>
            <Link href="/" aria-label="Home" className={styles.collapsedIcon}>
              <span />
            </Link>
          </div>
        )}
      </aside>

      <header className={styles.header}>
        <Link href="/" className={styles.headerTitle}>
          {title}
        </Link>
        <div className={styles.headerActions}>
          {session ? (
            <>
              <span className={styles.headerUser}>{session.user?.email ?? "Signed in"}</span>
              <button type="button" className={styles.signInButton} onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.signInButton}
              onClick={() => signIn("keycloak", { callbackUrl: "/files", prompt: "login" })}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <span>3D printer project portal</span>
      </footer>
    </div>
  );
}
