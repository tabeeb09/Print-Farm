import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";
import {
  actorCanOpenPeopleAdmin,
  getManageableRoleOptions,
  getManageableRoles,
  listPeopleGroupsForActor,
} from "../../lib/keycloakAdmin";

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
    asset_admin: "Can manage loanable assets, inventory, collections, returns, and damage records.",
  };

  return descriptions[role] || "Managed application role.";
}

function emptyGroupForm() {
  return {
    groupId: "",
    name: "",
    adminEmails: "",
    memberEmails: "",
    roles: [],
  };
}

function parseEmailEntries(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry && entry.includes("@"));
}

function formatEmailEntries(emails) {
  return Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)))
    .sort()
    .join("\n");
}

export default function PeopleAdminPage({ manageableRoles, initialRoleOptions }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [person, setPerson] = useState(null);
  const [roles, setRoles] = useState([]);
  const [directRoles, setDirectRoles] = useState([]);
  const [personGroups, setPersonGroups] = useState([]);
  const [managedBy, setManagedBy] = useState([]);
  const [people, setPeople] = useState([]);
  const [peopleGroups, setPeopleGroups] = useState([]);
  const [roleOptions, setRoleOptions] = useState(initialRoleOptions || []);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [groupMemberDraft, setGroupMemberDraft] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState([]);
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
      setDirectRoles(payload.directRoles || []);
      setPersonGroups(payload.groups || []);
      setManagedBy(payload.managedBy || []);
      if (Array.isArray(payload.roleOptions)) {
        setRoleOptions(payload.roleOptions);
      }
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
      if (Array.isArray(payload.roleOptions)) {
        setRoleOptions(payload.roleOptions);
      }
      setPerson(null);
      setRoles([]);
      setDirectRoles([]);
      setPersonGroups([]);
      setManagedBy([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load managed users.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    loadPeople();
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadGroups() {
    setError("");

    try {
      const response = await fetch("/api/admin/people/groups");
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load people groups.");
      }

      setPeopleGroups(payload.groups || []);
      if (Array.isArray(payload.roleOptions)) {
        setRoleOptions(payload.roleOptions);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load people groups.");
    }
  }

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
    setDirectRoles(entry.directRoles || []);
    setPersonGroups(entry.groups || []);
    setManagedBy(entry.managedBy || []);
    setMessage(`Selected ${entry.user.email}.`);
    setError("");
  }

  function openGroupModal(group = null) {
    if (group) {
      setGroupForm({
        groupId: group.id,
        name: group.name || "",
        adminEmails: (group.admins || []).join(", "),
        memberEmails: formatEmailEntries((group.members || []).map((member) => member.email || member.username)),
        roles: group.directRoles || [],
      });
    } else {
      setGroupForm(emptyGroupForm());
    }
    setGroupMemberDraft("");
    setGroupModalOpen(true);
    setError("");
    setMessage("");
  }

  function toggleGroupExpanded(groupId) {
    setExpandedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  }

  function updateGroupField(field, value) {
    setGroupForm((current) => ({ ...current, [field]: value }));
  }

  function toggleGroupRole(role) {
    setGroupForm((current) => {
      const rolesSet = new Set(current.roles || []);
      if (rolesSet.has(role)) {
        rolesSet.delete(role);
      } else {
        rolesSet.add(role);
      }
      return { ...current, roles: Array.from(rolesSet).sort() };
    });
  }

  function addGroupMembersFromDraft() {
    const additions = parseEmailEntries(groupMemberDraft);
    if (!additions.length) return;

    setGroupForm((current) => ({
      ...current,
      memberEmails: formatEmailEntries([
        ...parseEmailEntries(current.memberEmails),
        ...additions,
      ]),
    }));
    setGroupMemberDraft("");
  }

  function removeGroupMember(emailToRemove) {
    setGroupForm((current) => ({
      ...current,
      memberEmails: formatEmailEntries(
        parseEmailEntries(current.memberEmails).filter((email) => email !== emailToRemove),
      ),
    }));
  }

  async function saveGroup(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/people/groups", {
        method: groupForm.groupId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupForm),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save group.");
      }

      setPeopleGroups(payload.groups || []);
      if (Array.isArray(payload.roleOptions)) {
        setRoleOptions(payload.roleOptions);
      }
      setGroupModalOpen(false);
      setMessage(`Saved group ${payload.group?.name || groupForm.name}.`);
      await loadPeople();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save group.");
    } finally {
      setPending(false);
    }
  }

  async function deleteGroup(group) {
    if (!window.confirm(`Delete people group "${group.name}"? This removes the group and its inherited permissions.`)) {
      return;
    }

    setPending(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/people/groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete group.");
      }

      setPeopleGroups(payload.groups || []);
      setMessage(`Deleted group ${group.name}.`);
      await loadPeople();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete group.");
    } finally {
      setPending(false);
    }
  }

  const groupFormMembers = parseEmailEntries(groupForm.memberEmails);

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
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" onClick={() => router.push("/admin/people/balances")}>
              Balances
            </button>
            <button type="button" onClick={() => openGroupModal()} style={{ marginLeft: "0.75rem" }}>
              Create people group
            </button>
          </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start" }}>
            <div>
              <h2 style={{ marginTop: 0 }}>People groups</h2>
              <p style={{ color: "#555", marginTop: 0 }}>
                Group members inherit the regular permissions applied here. Delegate variants can only be
                assigned by someone who already has the matching super-delegation authority.
              </p>
            </div>
            <button type="button" onClick={() => openGroupModal()}>
              Create people group
            </button>
          </div>
          {peopleGroups.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Group</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Admins</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Members</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Direct permissions</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {peopleGroups.map((group) => {
                  const members = group.members || [];
                  const expanded = expandedGroupIds.includes(group.id);

                  return (
                    <tr key={group.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                      <td style={{ padding: "0.65rem 0" }}>{group.name}</td>
                      <td style={{ padding: "0.65rem 0" }}>{group.admins?.join(", ") || "none"}</td>
                      <td style={{ padding: "0.65rem 0" }}>
                        <button type="button" onClick={() => toggleGroupExpanded(group.id)}>
                          {expanded ? "Hide" : "Show"} {members.length} {members.length === 1 ? "member" : "members"}
                        </button>
                        {expanded ? (
                          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                            {members.length ? members.map((member) => (
                              <li key={member.id || member.email}>
                                {member.email || member.username || member.id}
                              </li>
                            )) : <li>No members in this group.</li>}
                          </ul>
                        ) : null}
                      </td>
                      <td style={{ padding: "0.65rem 0" }}>{group.directRoles?.join(", ") || "none"}</td>
                      <td style={{ padding: "0.65rem 0", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button type="button" onClick={() => openGroupModal(group)}>
                          Add people
                        </button>
                        <button type="button" onClick={() => openGroupModal(group)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => deleteGroup(group)} disabled={pending}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#666" }}>No people groups are currently visible in your management scope.</p>
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
                Effective roles: <strong>{roles.length ? roles.join(", ") : "none"}</strong>
              </span>
              <span>
                Direct roles: <strong>{directRoles.length ? directRoles.join(", ") : "none"}</strong>
              </span>
              <span>
                Groups: <strong>{personGroups.length ? personGroups.map((group) => group.name).join(", ") : "none"}</strong>
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
            {roleOptions.map((option) => {
              return (
                <div
                  key={option.role}
                  style={{
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    paddingTop: "0.75rem",
                  }}
                >
                  <strong>{option.role}</strong>
                  <p style={{ color: "#555", margin: "0.2rem 0 0.6rem" }}>{roleDescription(option.role)}</p>
                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    {option.variants.map((variant) => {
                      const directlyAssigned = directRoles.includes(variant.role);
                      const inherited = !directlyAssigned && roles.includes(variant.role);
                      return (
                        <div
                          key={variant.role}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(12rem, 1fr) minmax(12rem, 2fr) auto",
                            gap: "0.75rem",
                            alignItems: "center",
                          }}
                        >
                          <span>
                            <strong>{variant.role}</strong>
                            {inherited ? <small style={{ marginLeft: "0.5rem", color: "#8a5a00" }}>inherited</small> : null}
                          </span>
                          <span style={{ color: "#555" }}>{variant.description}</span>
                          {directlyAssigned ? (
                            <button
                              type="button"
                              disabled={pending || !email || !variant.canAssign}
                              onClick={() => removeRole(variant.role)}
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={pending || !email || inherited || !variant.canAssign}
                              onClick={() => assignRole(variant.role)}
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {groupModalOpen ? (
        <div className="assetModalBackdrop" role="presentation">
          <section className="assetModal" role="dialog" aria-modal="true" aria-label="People group">
            <form onSubmit={saveGroup} style={{ display: "grid", gap: "1rem" }}>
              <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{groupForm.groupId ? "Edit people group" : "Create people group"}</h2>
                  <p style={{ margin: "0.35rem 0 0", color: "#555" }}>
                    Members inherit selected group roles. By default, assign the regular role unless
                    this group is meant to delegate that permission onward.
                  </p>
                </div>
                <button type="button" onClick={() => setGroupModalOpen(false)}>
                  Close
                </button>
              </header>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>Group name</span>
                <input
                  value={groupForm.name}
                  onChange={(event) => updateGroupField("name", event.target.value)}
                  required
                />
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>Group admins, comma-separated emails</span>
                <textarea
                  rows={3}
                  value={groupForm.adminEmails}
                  onChange={(event) => updateGroupField("adminEmails", event.target.value)}
                  placeholder="admin@example.com, lead@example.com"
                />
              </label>

              <fieldset style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: "0.75rem" }}>
                <legend>People in this group</legend>
                <div style={{ display: "grid", gap: "0.85rem" }}>
                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span>Add people by email</span>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <input
                        type="text"
                        value={groupMemberDraft}
                        onChange={(event) => setGroupMemberDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addGroupMembersFromDraft();
                          }
                        }}
                        placeholder="member@example.com, trainee@example.com"
                        style={{ flex: "1 1 18rem" }}
                      />
                      <button type="button" onClick={addGroupMembersFromDraft}>
                        Add people
                      </button>
                    </div>
                  </label>

                  {groupFormMembers.length ? (
                    <div style={{ display: "grid", gap: "0.45rem" }}>
                      <strong>{groupFormMembers.length} selected {groupFormMembers.length === 1 ? "person" : "people"}</strong>
                      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                        {groupFormMembers.map((memberEmail) => (
                          <li key={memberEmail} style={{ marginBottom: "0.35rem" }}>
                            <span>{memberEmail}</span>
                            <button
                              type="button"
                              onClick={() => removeGroupMember(memberEmail)}
                              style={{ marginLeft: "0.5rem" }}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: "#666" }}>
                      No people selected yet. Add one or more email addresses above, then save the group.
                    </p>
                  )}

                  <label style={{ display: "grid", gap: "0.35rem" }}>
                    <span>Bulk edit member emails</span>
                    <textarea
                      rows={4}
                      value={groupForm.memberEmails}
                      onChange={(event) => updateGroupField("memberEmails", event.target.value)}
                      placeholder={"member@example.com\ntrainee@example.com"}
                    />
                  </label>
                </div>
              </fieldset>

              <div style={{ display: "grid", gap: "0.75rem" }}>
                <strong>Group permissions</strong>
                {roleOptions.map((option) => (
                  <fieldset key={option.role} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: "0.75rem" }}>
                    <legend>{option.role}</legend>
                    {option.variants.map((variant) => (
                      <label key={variant.role} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem", margin: "0.45rem 0" }}>
                        <input
                          type="checkbox"
                          checked={groupForm.roles.includes(variant.role)}
                          disabled={!variant.canAssign && !groupForm.roles.includes(variant.role)}
                          onChange={() => toggleGroupRole(variant.role)}
                        />
                        <span>
                          <strong>{variant.role}</strong>
                          <br />
                          <small>{variant.description}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setGroupModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={pending}>
                  {pending ? "Saving..." : "Save group"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return {
      redirect: {
        destination: "/auth/signin?callbackUrl=%2Fadmin%2Fpeople",
        permanent: false,
      },
    };
  }

  if (!actorCanOpenPeopleAdmin(actor)) {
    const groups = await listPeopleGroupsForActor(actor);
    if (groups.length) {
      return {
        props: {
          manageableRoles: getManageableRoles(),
          initialRoleOptions: getManageableRoleOptions(actor),
        },
      };
    }

    return {
      notFound: true,
    };
  }

  return {
    props: {
      manageableRoles: getManageableRoles(),
      initialRoleOptions: getManageableRoleOptions(actor),
    },
  };
}
