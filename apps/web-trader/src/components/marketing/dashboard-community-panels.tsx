"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarBlank,
  Check,
  Copy,
  Hash,
  LockKey,
  Plus,
  ShieldCheck,
  SpeakerHigh,
  X,
} from "@phosphor-icons/react";
import {
  communityEvents,
  communityMembers,
  type CommunityChannel,
  type CommunityMember,
  type CommunityRole,
} from "./dashboard-community-data";
import { CommunityAvatar } from "./dashboard-community-messages";

export function CommunityDialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`dc-community-dialog ${wide ? "dc-community-dialog-wide" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <h3>{title}</h3>
        <button onClick={onClose} aria-label={`Close ${title}`} autoFocus>
          <X size={20} />
        </button>
      </header>
      <div className="dc-community-dialog-body">{children}</div>
    </dialog>
  );
}

export function CommunityMemberList({
  roles,
  timedOut,
  onDirectMessage,
}: {
  roles: Record<string, CommunityRole>;
  timedOut: Set<string>;
  onDirectMessage: (id: string) => void;
}) {
  return (
    <div className="dc-community-member-list">
      {["Online", "Away", "Offline"].map((presence) => (
        <section key={presence}>
          <h4>
            {presence}{" "}
            <span>
              {
                communityMembers.filter(
                  (member) => member.presence === presence,
                ).length
              }
            </span>
          </h4>
          {communityMembers
            .filter((member) => member.presence === presence)
            .map((member) => (
              <button
                className="dc-community-member"
                key={member.id}
                onClick={() => onDirectMessage(member.id)}
                aria-label={`Message ${member.name}`}
              >
                <CommunityAvatar member={member} small />
                <span>
                  <strong>{member.name}</strong>
                  <small>
                    {timedOut.has(member.id)
                      ? "Timed out · demo"
                      : roles[member.id]}
                  </small>
                </span>
              </button>
            ))}
        </section>
      ))}
    </div>
  );
}

export function CommunityEvents({
  joined,
  onToggle,
}: {
  joined: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="dc-community-events">
      <p className="dc-community-panel-description">
        Briefings and reviews for your community. RSVP changes stay in this
        preview.
      </p>
      {communityEvents.map((event) => (
        <article key={event.id}>
          <div className="dc-community-event-date">
            <CalendarBlank size={22} />
            <strong>{event.day}</strong>
          </div>
          <div>
            <h4>{event.title}</h4>
            <p>{event.description}</p>
            <dl>
              <div>
                <dt>Time</dt>
                <dd>{event.time}</dd>
              </div>
              <div>
                <dt>Host</dt>
                <dd>{event.host}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{event.room}</dd>
              </div>
            </dl>
            <div className="dc-community-event-rsvp">
              <span>{event.attendees} interested</span>
              <button
                className="dc-community-button"
                aria-pressed={joined.has(event.id)}
                onClick={() => onToggle(event.id)}
              >
                {joined.has(event.id) ? (
                  <Check size={16} />
                ) : (
                  <Plus size={16} />
                )}
                {joined.has(event.id) ? "Going" : "RSVP"}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

const roleNames: CommunityRole[] = [
  "Community owner",
  "Moderator",
  "Trader",
  "Support",
];
const permissionNames = [
  "Send messages",
  "Join voice rooms",
  "Manage channels",
  "Pin messages",
  "Moderate members",
];
export const defaultCommunityPermissions: Record<CommunityRole, string[]> = {
  "Community owner": [...permissionNames],
  Moderator: [...permissionNames],
  Trader: permissionNames.slice(0, 2),
  Support: ["Send messages", "Join voice rooms", "Pin messages"],
};

export function CommunitySettings({
  channels,
  onCreate,
  roles,
  onRole,
  permissions,
  onPermission,
  timedOut,
  onTimeout,
  slowMode,
  onSlowMode,
}: {
  channels: CommunityChannel[];
  onCreate: (name: string, kind: "text" | "voice") => void;
  roles: Record<string, CommunityRole>;
  onRole: (id: string, role: CommunityRole) => void;
  permissions: Record<CommunityRole, string[]>;
  onPermission: (role: CommunityRole, permission: string) => void;
  timedOut: Set<string>;
  onTimeout: (id: string) => void;
  slowMode: boolean;
  onSlowMode: (value: boolean) => void;
}) {
  const [section, setSection] = useState("Channels");
  const [channelName, setChannelName] = useState("");
  const [channelKind, setChannelKind] = useState<"text" | "voice">("text");
  const [error, setError] = useState("");
  const [role, setRole] = useState<CommunityRole>("Moderator");
  const [member, setMember] = useState("marcus");
  const [invite, setInvite] = useState(false);
  const create = () => {
    const name = channelName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(name)) {
      setError("Use 2–31 letters, numbers or hyphens for a channel name.");
      return;
    }
    if (channels.some((channel) => channel.name.toLowerCase() === name)) {
      setError("A channel with this name already exists.");
      return;
    }
    onCreate(name, channelKind);
    setChannelName("");
    setError("");
  };
  return (
    <div className="dc-community-settings">
      <div
        className="dc-community-settings-tabs"
        role="tablist"
        aria-label="Community settings"
      >
        {["Channels", "Roles", "Moderation"].map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={section === tab}
            onClick={() => setSection(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      {section === "Channels" && (
        <section>
          <h4>Channel organization</h4>
          <p className="dc-community-panel-description">
            Create a local text or voice channel for the team.
          </p>
          <div className="dc-community-setting-fields">
            <label>
              Channel name
              <input
                aria-label="New channel name"
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
                placeholder="daily-review"
                maxLength={31}
              />
            </label>
            <label>
              Channel type
              <select
                aria-label="New channel type"
                value={channelKind}
                onChange={(event) =>
                  setChannelKind(event.target.value as "text" | "voice")
                }
              >
                <option value="text">Text channel</option>
                <option value="voice">Voice room</option>
              </select>
            </label>
            <button className="dc-community-button" onClick={create}>
              <Plus size={16} />
              Create channel
            </button>
          </div>
          {error && (
            <p className="dc-community-error" role="alert">
              {error}
            </p>
          )}
          <div className="dc-community-channel-inventory">
            {channels
              .filter((channel) => channel.kind !== "dm")
              .map((channel) => (
                <div key={channel.id}>
                  {channel.kind === "voice" ? (
                    <SpeakerHigh size={16} />
                  ) : (
                    <Hash size={16} />
                  )}
                  <strong>{channel.name}</strong>
                  <span>
                    {channel.kind === "voice" ? "Voice room" : "Text channel"}
                  </span>
                </div>
              ))}
          </div>
          <div className="dc-community-invite">
            <div>
              <h4>Preview an invitation</h4>
              <p>Demo code for showing the onboarding experience.</p>
            </div>
            <button
              className="dc-community-button"
              onClick={() => setInvite(!invite)}
            >
              <Copy size={16} />
              {invite ? "Hide code" : "Show code"}
            </button>
            {invite && (
              <label className="dc-community-invite-code">
                Local invitation code
                <input
                  value="AZURIYA-PREVIEW-TEAM"
                  readOnly
                  aria-label="Local invitation code"
                  onFocus={(event) => event.target.select()}
                />
              </label>
            )}
          </div>
        </section>
      )}
      {section === "Roles" && (
        <section>
          <h4>Roles & permissions</h4>
          <p className="dc-community-panel-description">
            Try local role assignments and see them update beside each member.
          </p>
          <div className="dc-community-role-assignments">
            {communityMembers
              .filter((person) => person.id !== "you")
              .map((person) => (
                <div key={person.id}>
                  <CommunityAvatar member={person} small />
                  <strong>{person.name}</strong>
                  <select
                    aria-label={`Role for ${person.name}`}
                    value={roles[person.id]}
                    onChange={(event) =>
                      onRole(person.id, event.target.value as CommunityRole)
                    }
                  >
                    {roleNames.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
          <label className="dc-community-role-select">
            Inspect role
            <select
              aria-label="Inspect community role"
              value={role}
              onChange={(event) => setRole(event.target.value as CommunityRole)}
            >
              {roleNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <div className="dc-community-permissions">
            {permissionNames.map((permission) => (
              <label key={permission}>
                <ShieldCheck size={18} />
                <span>{permission}</span>
                <input
                  type="checkbox"
                  aria-label={`${permission} permission for ${role}`}
                  checked={permissions[role].includes(permission)}
                  onChange={() => onPermission(role, permission)}
                />
              </label>
            ))}
          </div>
        </section>
      )}
      {section === "Moderation" && (
        <section>
          <h4>Keep conversations focused</h4>
          <p className="dc-community-panel-description">
            These controls update the demo only. They do not change real member
            access.
          </p>
          <label className="dc-community-setting-toggle">
            <LockKey size={19} />
            <span>
              <strong>Slow mode</strong>
              <small>Limit consecutive messages to one every 30 seconds.</small>
            </span>
            <input
              type="checkbox"
              aria-label="Enable community slow mode"
              checked={slowMode}
              onChange={(event) => onSlowMode(event.target.checked)}
            />
          </label>
          <div className="dc-community-moderation-form">
            <label>
              Member
              <select
                aria-label="Member to moderate"
                value={member}
                onChange={(event) => setMember(event.target.value)}
              >
                {communityMembers
                  .filter(
                    (person) => person.id !== "you" && person.id !== "alex",
                  )
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="dc-community-button"
              onClick={() => onTimeout(member)}
            >
              {timedOut.has(member)
                ? "Remove timeout"
                : "Timeout for 10 minutes"}
            </button>
          </div>
          <div className="dc-community-moderation-log">
            <h4>Local moderation log</h4>
            {timedOut.size ? (
              [...timedOut].map((id) => (
                <p key={id}>
                  <ShieldCheck size={16} />
                  <span>
                    {communityMembers.find((person) => person.id === id)?.name}{" "}
                    · 10 minute timeout
                  </span>
                </p>
              ))
            ) : (
              <p>
                <Check size={16} />
                No members timed out
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function CommunityVoicePeople({ joined }: { joined: boolean }) {
  const people: CommunityMember[] = [
    communityMembers[0],
    communityMembers[1],
    communityMembers[2],
    ...(joined ? [communityMembers[6]] : []),
  ];
  return (
    <div className="dc-community-voice-people">
      {people.map((member, index) => (
        <div
          className={`dc-community-voice-person ${index === 1 ? "dc-community-speaking" : ""}`}
          key={member.id}
        >
          <CommunityAvatar member={member} />
          <strong>{member.name}</strong>
          <span>
            {index === 1 ? "Speaking · example" : "Listening · example"}
          </span>
          <div className="dc-community-wave" aria-hidden="true">
            {[5, 11, 17, 8, 20, 12, 6, 15, 9].map((height, wave) => (
              <i key={wave} style={{ height }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
