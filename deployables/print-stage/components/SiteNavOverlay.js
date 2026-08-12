import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { Fragment, useEffect, useState } from "react";

import { menuItems } from "../lib/layoutData";
import shellStyles from "../styles/Home.module.css";
import overlayStyles from "../styles/MakerspaceDesign.module.css";

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

function InventorySidebarTree({ groups, router, parentId = null, depth = 0, onNavigate }) {
  const children = childGroups(groups, parentId);
  if (!children.length) return null;

  return (
    <div className={shellStyles.navTree} style={{ "--tree-depth": depth }}>
      {children.map((group) => (
        <Fragment key={group.id}>
          <Link
            href={{ pathname: "/admin/assets/inventory", query: { groupId: group.id } }}
            className={`${shellStyles.navTreeLink} ${
              router.query.groupId === group.id ? shellStyles.navTreeLinkActive : ""
            } ${overlayStyles.appNavTreeLink}`}
            onClick={onNavigate}
          >
            {group.name}
          </Link>
          <InventorySidebarTree
            groups={groups}
            router={router}
            parentId={group.id}
            depth={depth + 1}
            onNavigate={onNavigate}
          />
        </Fragment>
      ))}
    </div>
  );
}

function NavPanelArrow() {
  return (
    <svg className={overlayStyles.appNavCloseSvg} viewBox="0 0 7.8847664 23.537114" aria-hidden="true" focusable="false">
      <path
        className={overlayStyles.appNavCloseGlyph}
        d="M 0.3769539,0 H 0 L 7.3593758,11.699218 0.0429696,23.537109 H 0.3964559 L 7.8847668,11.697265 Z"
      />
    </svg>
  );
}

export function SiteNavOverlay({ open, onClose, onSectionNavigate }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [hasDelegatedPeopleAdmin, setHasDelegatedPeopleAdmin] = useState(false);
  const [inventoryTree, setInventoryTree] = useState(null);
  const roles = Array.isArray(session?.user?.roles)
    ? session.user.roles.map(normalizeRole).filter(Boolean)
    : [];
  const userEmail = normalizeEmail(session?.user?.email);
  const isSuperadmin =
    Boolean(session?.user?.isSuperadmin) || DEV_SUPERADMIN_EMAILS.includes(userEmail);
  const isQueueAdmin =
    isSuperadmin || ["owner", "technician", "print_admin"].some((role) => roles.includes(role));
  const isOpenBaoAdmin =
    isSuperadmin || ["owner", "openbao_admin", "infra_admin"].some((role) => roles.includes(role));
  const isHrAdmin =
    isSuperadmin ||
    ["owner", "identity_hr_manager"].some((role) => roles.includes(role)) ||
    roles.some((role) => role.endsWith("_grant") || role.endsWith("_grant_super"));
  const canOpenPeopleAdmin = isHrAdmin || hasDelegatedPeopleAdmin;
  const isAssetAdmin = isSuperadmin || ["owner", "asset_admin"].some((role) => roles.includes(role));
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

  function isActiveHref(href) {
    if (href.includes("#")) return router.asPath === href;
    return router.pathname === href;
  }

  function handleMenuItemClick(event, item) {
    if (item.section && router.pathname === "/" && typeof onSectionNavigate === "function") {
      event.preventDefault();
      onSectionNavigate(item.section);
      return;
    }

    onClose?.();
  }

  useEffect(() => {
    let cancelled = false;

    async function checkDelegatedPeopleAdmin() {
      if (!open || !session || isHrAdmin) {
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
  }, [isHrAdmin, open, session?.user?.email]);

  useEffect(() => {
    let cancelled = false;

    async function loadInventoryTree() {
      if (!open || !session || !isAssetAdmin) {
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
  }, [isAssetAdmin, open, session?.user?.email]);

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

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className={overlayStyles.appNavBackdrop}
        aria-label="Close print portal navigation"
        onClick={onClose}
      />
      <aside
        id="makerspace-fixed-nav"
        className={`${shellStyles.sidebar} ${overlayStyles.appNavSidebar}`}
        aria-label="Print portal navigation"
      >
        <div className={`${shellStyles.sidebarTop} ${overlayStyles.appNavTop}`}>
          <Link href="/" className={`${shellStyles.brand} ${overlayStyles.appNavBrand}`} onClick={onClose}>
            <img
              className={overlayStyles.appNavLogo}
              src="/makerspace-design/assets/footer-logo.png"
              alt=""
              aria-hidden="true"
            />
            <span className={shellStyles.brandCopy}>
              <strong>Bath Makerspace</strong>
              <small>Print portal</small>
            </span>
          </Link>

          <button
            className={overlayStyles.appNavClose}
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <NavPanelArrow />
          </button>
        </div>

        <nav className={`${shellStyles.navSection} ${overlayStyles.appNavSection}`} aria-label="Sidebar navigation">
          <p className={`${shellStyles.navTitle} ${overlayStyles.appNavTitle}`}>Menu</p>
          {visibleMenuItems.map((item) => (
            <Fragment key={item.href}>
              <Link
                href={item.href}
                className={`${shellStyles.navLink} ${
                  isActiveHref(item.href) ? shellStyles.navLinkActive : ""
                } ${overlayStyles.appNavLink} ${isActiveHref(item.href) ? overlayStyles.appNavLinkActive : ""}`}
                onClick={(event) => handleMenuItemClick(event, item)}
              >
                <span>{item.title}</span>
                <small>{item.label}</small>
              </Link>
              {item.href === "/admin/assets/inventory" && inventoryTree?.groups?.length ? (
                <div className={shellStyles.navTreeWrap}>
                  <Link
                    href="/admin/assets/inventory"
                    className={`${shellStyles.navTreeRoot} ${
                      router.pathname === "/admin/assets/inventory" && !router.query.groupId
                        ? shellStyles.navTreeLinkActive
                        : ""
                    } ${overlayStyles.appNavTreeRoot}`}
                    onClick={onClose}
                  >
                    Inventory root
                  </Link>
                  <InventorySidebarTree groups={inventoryTree.groups} router={router} onNavigate={onClose} />
                </div>
              ) : null}
            </Fragment>
          ))}
        </nav>

        <div className={overlayStyles.appNavAccount}>
          {session ? (
            <>
              <span>{session.user?.email ?? "Signed in"}</span>
              <button type="button" className={shellStyles.signInButton} onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className={shellStyles.signInButton}
              onClick={() => {
                onClose?.();
                router.push(`/auth/signin?callbackUrl=${encodeURIComponent(router.asPath || "/")}`);
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
