"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  CalendarBlank,
  ChatCircleDots,
  CheckCircle,
  Crown,
  FolderOpen,
  Hash,
  MagnifyingGlass,
  ShieldCheck,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";
import "./dashboard-teams.css";

const members = [
  {
    name: "Alex Morgan",
    initials: "AM",
    team: "Gold Elite",
    role: "Owner",
    status: "Online",
    platform: "MetaTrader 5",
    account: "#23192",
  },
  {
    name: "Maya Patel",
    initials: "MP",
    team: "Gold Elite",
    role: "Mentor",
    status: "In a voice room",
    platform: "cTrader",
    account: "#64102",
  },
  {
    name: "Nina Brooks",
    initials: "NB",
    team: "Gold Elite",
    role: "Trader",
    status: "Away",
    platform: "MetaTrader 5",
    account: "#71840",
  },
  {
    name: "James Carter",
    initials: "JC",
    team: "FX Intraday",
    role: "Mentor",
    status: "Online",
    platform: "MetaTrader 5",
    account: "#92731",
  },
  {
    name: "Ryan Mitchell",
    initials: "RM",
    team: "FX Intraday",
    role: "Moderator",
    status: "Online",
    platform: "cTrader",
    account: "#18273",
  },
  {
    name: "Olivia Chen",
    initials: "OC",
    team: "FX Intraday",
    role: "Trader",
    status: "Offline",
    platform: "TradeLocker",
    account: "#92021",
  },
  {
    name: "Daniel Reed",
    initials: "DR",
    team: "Scalping Pro",
    role: "Mentor",
    status: "Online",
    platform: "TradeLocker",
    account: "#46281",
  },
  {
    name: "Zara Khan",
    initials: "ZK",
    team: "Scalping Pro",
    role: "Trader",
    status: "Away",
    platform: "MetaTrader 5",
    account: "#71245",
  },
  {
    name: "Ethan Cole",
    initials: "EC",
    team: "Algo Team",
    role: "Moderator",
    status: "Online",
    platform: "MetaTrader 5",
    account: "#18034",
  },
  {
    name: "Sofia Reyes",
    initials: "SR",
    team: "Algo Team",
    role: "Trader",
    status: "Offline",
    platform: "cTrader",
    account: "#48275",
  },
];

const accessRoles = ["Mentor", "Moderator", "Trader", "Guest"];
const permissions = [
  {
    name: "Post in team channels",
    detail: "Messages, reactions and discussion threads",
    defaults: [true, true, true, false],
  },
  {
    name: "Host voice sessions",
    detail: "Session rooms, screen sharing and stage speakers",
    defaults: [true, true, false, false],
  },
  {
    name: "Manage community content",
    detail: "Pinned resources and channel moderation",
    defaults: [false, true, false, false],
  },
  {
    name: "View team account reports",
    detail: "Example reports for assigned account groups",
    defaults: [true, true, false, false],
  },
];

export function DashboardTeams({
  team,
  onCommunity,
  onAccounts,
}: {
  team: string;
  onCommunity: (team: string, channel?: string, panel?: "pins") => void;
  onAccounts: () => void;
}) {
  const [section, setSection] = useState("Members");
  const [search, setSearch] = useState("");
  const [presence, setPresence] = useState("All members");
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [accessByTeam, setAccessByTeam] = useState<Record<string, boolean[][]>>(
    {},
  );
  const access = accessByTeam[team] ?? permissions.map((rule) => rule.defaults);
  const [invite, setInvite] = useState(false);
  const [rsvp, setRsvp] = useState(false);
  const [feedback, setFeedback] = useState("");
  const scoped = members.filter(
    (member) => team === "All teams" || member.team === team,
  );
  const visible = scoped.filter(
    (member) =>
      `${member.name} ${member.team} ${roles[member.name] ?? member.role}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (presence === "All members" ||
        (presence === "Online"
          ? member.status === "Online" || member.status === "In a voice room"
          : member.status === presence)),
  );

  return (
    <section className="dt-teamspace" aria-label="Team management preview">
      <header className="dt-team-header">
        <div className="dt-team-identity">
          <span className="dt-team-emblem">
            <UsersThree size={24} weight="duotone" />
          </span>
          <div>
            <h3>
              {team === "All teams"
                ? "Your people, connected"
                : `${team} workspace`}
            </h3>
            <p>Community roles, platform access and shared sessions.</p>
          </div>
        </div>
        <button
          onClick={() => {
            setInvite(!invite);
            setFeedback("");
          }}
          aria-expanded={invite}
        >
          <UserPlus size={16} /> Invite members
        </button>
      </header>
      {invite && (
        <div className="dt-invite" role="status">
          <UserPlus size={20} />
          <div>
            <strong>Example invite · ALPHA-TEAM-4821</strong>
            <p>
              Members join a team before receiving channels and assigned account
              access. This demo code cannot be redeemed.
            </p>
          </div>
          <button onClick={() => setInvite(false)}>Close invite</button>
        </div>
      )}
      <div
        className="dt-connection-map"
        aria-label="Team workspace connections"
      >
        {[
          {
            title: "People",
            detail: "Owners · mentors · traders",
            icon: UsersThree,
          },
          {
            title: "Communication",
            detail: "Channels · threads · voice",
            icon: ChatCircleDots,
          },
          {
            title: "Accounts",
            detail: "MT5 · cTrader · TradeLocker",
            icon: FolderOpen,
          },
          {
            title: "Permissions",
            detail: "Assigned groups & roles",
            icon: ShieldCheck,
          },
        ].map(({ title, detail, icon: Icon }) => (
          <div key={title}>
            <Icon size={18} weight="duotone" />
            <strong>{title}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
      <nav className="dt-team-tabs" aria-label="Team workspace sections">
        {["Members", "Role permissions", "Events & resources"].map((name) => (
          <button
            key={name}
            aria-pressed={section === name}
            onClick={() => {
              setSection(name);
              setFeedback("");
            }}
          >
            {name}
          </button>
        ))}
        <button className="dt-open-community" onClick={() => onCommunity(team)}>
          <Hash size={16} /> Open team channels <ArrowUpRight size={14} />
        </button>
      </nav>
      {section === "Members" && (
        <div className="dt-member-panel">
          <div className="dt-directory-toolbar">
            <span>
              <strong>Member directory</strong>
              <small>{scoped.length} example profiles</small>
            </span>
            <label>
              <MagnifyingGlass size={16} />
              <input
                aria-label="Search team members"
                placeholder="Search people or roles"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter team member presence"
              value={presence}
              onChange={(event) => setPresence(event.target.value)}
            >
              {["All members", "Online", "Away", "Offline"].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="dt-roster" aria-live="polite">
            {visible.map((member) => (
              <article className="dt-member" key={member.name}>
                <div className="dt-member-main">
                  <span className="dt-avatar">
                    {member.initials}
                    <i data-presence={member.status} />
                  </span>
                  <div>
                    <strong>
                      {member.name}
                      {member.role === "Owner" && <Crown size={13} />}
                    </strong>
                    <span>{member.team}</span>
                  </div>
                </div>
                <span className="dt-presence">
                  <i data-presence={member.status} />
                  {member.status}
                </span>
                <label className="dt-role">
                  <span>Community role</span>
                  <select
                    aria-label={`Community role for ${member.name}`}
                    value={roles[member.name] ?? member.role}
                    disabled={member.role === "Owner"}
                    onChange={(event) => {
                      setRoles({ ...roles, [member.name]: event.target.value });
                      setFeedback(
                        `Local role preview updated for ${member.name}.`,
                      );
                    }}
                  >
                    {["Owner", ...accessRoles].map((name) => (
                      <option
                        key={name}
                        disabled={name === "Owner" && member.role !== "Owner"}
                      >
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="dt-member-account">
                  <FolderOpen size={14} />
                  <span>{member.platform}</span>
                  <small>{member.account}</small>
                </div>
              </article>
            ))}
            {visible.length === 0 && (
              <div className="dt-empty">
                <MagnifyingGlass size={22} />
                <strong>No matching members</strong>
                <span>Try another name, role or presence filter.</span>
              </div>
            )}
          </div>
          <div className="dt-roster-footer">
            <span>
              Account ownership is enforced separately from community roles.
            </span>
            <button onClick={onAccounts}>
              View trading accounts <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      )}
      {section === "Role permissions" && (
        <div className="dt-permissions-panel">
          <div className="dt-permission-heading">
            <ShieldCheck size={22} />
            <div>
              <h4>Community capability matrix</h4>
              <p>
                Preview what each role can do in this team. Owner access is
                fixed.
              </p>
            </div>
          </div>
          <div className="dt-matrix-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  {accessRoles.map((role) => (
                    <th scope="col" key={role}>
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissions.map((permission, row) => (
                  <tr key={permission.name}>
                    <th scope="row">
                      {permission.name}
                      <small>{permission.detail}</small>
                    </th>
                    {accessRoles.map((role, column) => (
                      <td key={role}>
                        <label className="dt-permission-hit">
                          <input
                            type="checkbox"
                            aria-label={`${role}: ${permission.name}`}
                            checked={access[row][column]}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setAccessByTeam((current) => ({
                                ...current,
                                [team]: (
                                  current[team] ??
                                  permissions.map((rule) => rule.defaults)
                                ).map((values, index) =>
                                  index === row
                                    ? values.map((value, i) =>
                                        i === column ? checked : value,
                                      )
                                    : values,
                                ),
                              }));
                              setFeedback(
                                "Community permission draft updated locally.",
                              );
                            }}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dt-permission-guard">
            <ShieldCheck size={16} />
            Trading validation, risk limits and account ownership remain
            enforced.
          </div>
        </div>
      )}
      {section === "Events & resources" && (
        <div className="dt-resources-panel">
          <article className="dt-team-event">
            <span className="dt-date">
              <strong>01</strong>OCT
            </span>
            <div>
              <span className="dt-kicker">EXAMPLE TEAM SESSION</span>
              <h4>London session debrief</h4>
              <p>16:00 UTC · Strategy voice room · Hosted by Maya Patel</p>
              <button onClick={() => setRsvp(!rsvp)} aria-pressed={rsvp}>
                {rsvp ? <CheckCircle size={16} /> : <CalendarBlank size={16} />}
                {rsvp ? "You're interested" : "Mark interested"}
              </button>
            </div>
          </article>
          <div className="dt-resource-list">
            <h4>Shared team library</h4>
            {[
              {
                title: "Community onboarding",
                channel: "announcements",
                detail: "Pinned in announcements",
                panel: "pins" as const,
              },
              {
                title: "Funding & account support",
                channel: "account-support",
                detail: "Pinned in account-support",
                panel: "pins" as const,
              },
              {
                title: "Market session discussion",
                channel: "market-discussion",
                detail: "Discuss in market-discussion",
                panel: undefined,
              },
            ].map(({ title, channel, detail, panel }) => (
              <button
                key={title}
                onClick={() => {
                  onCommunity(team, channel, panel);
                }}
              >
                <span>
                  <FolderOpen size={18} />
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      <footer className="dt-preview-note">
        <span role="status">
          {feedback ||
            "Local team management preview · no invitations or access changes are sent."}
        </span>
      </footer>
    </section>
  );
}
