import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useEffect, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";
import { getManageableRoles } from "../../lib/keycloakAdmin";

function roleDescription(role) {
  const descriptions = {
    viewer: "Basic signed-in access.",
    editor: "Can edit content where editor access is honoured.",
    media_admin: "Can manage uploaded media and submitted files.",
    technician: "Can operate print workflows.",
    print_admin: "Can manage the print queue.",
    config_admin: "Can review configuration requests.",
    openbao_admin: "Can mint OpenBao worker credentials.",
    infra_admin: "Infrastructure administration access.",
    identity_hr_manager: "Can manage people and permissions.",
  };

  return descriptions[role] || "Managed application role.";
}

export default function PeopleAdminPage({ manageableRoles }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [person, setPerson] = useState(null);
  const [roles, setRoles] = useState([]);
  const [managedBy, setManagedBy] = useState([]);
  const [people, setPeople] = useState([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestPeopleApi(method, body) {
    setPending(true);
    setError("");
    setMessage("");

    try {
      const url =
        method === "GET"
          ? `/api/admin/people?email=${encodeURIComponent(email)}`
          : "/api/admin/people";
      const response = await fetch(url, {
        method,
        headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Permission request failed.");
      }

      setPerson(payload.user);
      setRoles(payload.roles || []);
      setManagedBy(payload.managedBy || []);
      if (Array.isArray(payload.people)) {
        setPeople(payload.people);
      }
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Permission request failed.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function loadPeople() {
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/admin/people");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load managed users.");
      }

      setPeople(payload.people || []);
      setPerson(null);
      setRoles([]);
      setManagedBy([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load managed users.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchPerson(event) {
    event.preventDefault();
    const payload = await requestPeopleApi("GET");
    if (payload?.user) {
      setMessage(`Found ${payload.user.email}.`);
    } else if (payload) {
      setMessage("No user found yet. Create the user or assign a first role below.");
    }
  }

  async function createPerson() {
    const payload = await requestPeopleApi("POST", { email, name, managerEmail });
    if (payload?.user) {
      setMessage(`User ready: ${payload.user.email}.`);
      await loadPeople();
    }
  }

  async function assignRole(role) {
    const payload = await requestPeopleApi("POST", { email, role, managerEmail });
    if (payload?.user) {
      setMessage(`Assigned ${role} to ${payload.user.email}.`);
      await loadPeople();
    }
  }

  async function removeRole(role) {
    const payload = await requestPeopleApi("DELETE", { email, role });
    if (payload?.user) {
      setMessage(`Removed ${role} from ${payload.user.email}.`);
      await loadPeople();
    }
  }

  function selectPerson(entry) {
    setPerson(entry.user);
    setEmail(entry.user.email || "");
    setName([entry.user.firstName, entry.user.lastName].filter(Boolean).join(" "));
    setRoles(entry.roles || []);
    setManagedBy(entry.managedBy || []);
    setMessage(`Selected ${entry.user.email}.`);
    setError("");
  }

  return (
    <SiteShell title="People permissions">
      <Head>
        <title>People permissions | 3D Printer</title>
      </Head>

      <div style={{ maxWidth: "72rem", margin: "0 auto", display: "grid", gap: "1.25rem" }}>
        <section className="panel">
          <h1 style={{ margin: 0 }}>People and permissions</h1>
          <p style={{ margin: 0, maxWidth: "52rem", color: "#555" }}>
            Look up a person by email, create the Keycloak user if needed, and grant or remove only
            approved application roles. This is intentionally small: no raw Keycloak admin console,
            no arbitrary role names.
          </p>
        </section>

        <section className="panel">
          <form onSubmit={searchPerson} style={{ display: "grid", gap: "0.85rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="person@example.com"
                required
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Name, optional for new users</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ada Lovelace"
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Manager email, optional for owners</span>
              <input
                type="email"
                value={managerEmail}
                onChange={(event) => setManagerEmail(event.target.value)}
                placeholder="manager@example.com"
              />
            </label>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="submit" disabled={pending}>
                {pending ? "Working..." : "Search"}
              </button>
              <button type="button" onClick={createPerson} disabled={pending || !email}>
                Create / ensure user
              </button>
            </div>
          </form>
        </section>

        {error ? (
          <section className="panel" role="alert" style={{ borderColor: "rgba(164, 0, 0, 0.25)" }}>
            <strong>Could not update permissions</strong>
            <p style={{ marginBottom: 0 }}>{error}</p>
          </section>
        ) : null}

        {message ? (
          <section className="panel" role="status">
            {message}
          </section>
        ) : null}

        <section className="panel panelWide">
          <h2 style={{ marginTop: 0 }}>Visible managed users</h2>
          {people.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Roles</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Managed by</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {people.map((entry) => (
                  <tr key={entry.user.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={{ padding: "0.65rem 0" }}>{entry.user.email}</td>
                    <td style={{ padding: "0.65rem 0" }}>{entry.roles?.join(", ") || "none"}</td>
                    <td style={{ padding: "0.65rem 0" }}>{entry.managedBy?.join(", ") || "owner only"}</td>
                    <td style={{ padding: "0.65rem 0" }}>
                      <button type="button" onClick={() => selectPerson(entry)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#666" }}>No users are currently visible in your management scope.</p>
          )}
        </section>

        <section className="panel panelWide">
          <h2 style={{ marginTop: 0 }}>Current person</h2>
          {person ? (
            <div style={{ display: "grid", gap: "0.4rem" }}>
              <strong>{person.email || email}</strong>
              <span style={{ color: "#555" }}>User ID: {person.id}</span>
              <span style={{ color: "#555" }}>Enabled: {person.enabled === false ? "No" : "Yes"}</span>
              <span>
                Current roles: <strong>{roles.length ? roles.join(", ") : "none"}</strong>
              </span>
              <span>
                Managed by: <strong>{managedBy.length ? managedBy.join(", ") : "owner only"}</strong>
              </span>
            </div>
          ) : (
            <p style={{ color: "#666" }}>Search for a person to see their current roles.</p>
          )}
        </section>

        <section className="panel panelWide">
          <h2 style={{ marginTop: 0 }}>Manage roles</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {manageableRoles.map((role) => {
              const assigned = roles.includes(role);
              return (
                <div
                  key={role}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(10rem, 1fr) minmax(12rem, 2fr) auto",
                    gap: "0.75rem",
                    alignItems: "center",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    paddingTop: "0.75rem",
                  }}
                >
                  <strong>{role}</strong>
                  <span style={{ color: "#555" }}>{roleDescription(role)}</span>
                  {assigned ? (
                    <button type="button" disabled={pending || !email} onClick={() => removeRole(role)}>
                      Remove
                    </button>
                  ) : (
                    <button type="button" disabled={pending || !email} onClick={() => assignRole(role)}>
                      Assign
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return {
      redirect: {
        destination: "/api/auth/signin?callbackUrl=%2Fadmin%2Fpeople",
        permanent: false,
      },
    };
  }

  if (!actor.isHrAdmin) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      manageableRoles: getManageableRoles(),
    },
  };
}
