"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BellSlash,
  CalendarBlank,
  CaretDown,
  ChatCircleDots,
  CheckCircle,
  Hash,
  Headphones,
  SpeakerSlash,
  MagnifyingGlass,
  Megaphone,
  Microphone,
  MicrophoneSlash,
  MonitorArrowUp,
  PhoneDisconnect,
  Plus,
  PushPin,
  ShieldCheck,
  SlidersHorizontal,
  SpeakerHigh,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import {
  communityChannels,
  communityHistory,
  communityMembers,
  type CommunityMessage,
  type CommunityRole,
} from "./dashboard-community-data";
import {
  CommunityComposer,
  type CommunityDraft,
} from "./dashboard-community-composer";
import {
  CommunityAvatar,
  CommunityChart,
  CommunityMessageRow,
} from "./dashboard-community-messages";
import {
  CommunityDialog,
  CommunityEvents,
  CommunityMemberList,
  CommunitySettings,
  CommunityVoicePeople,
  defaultCommunityPermissions,
} from "./dashboard-community-panels";
import "./dashboard-community.css";

type CommunityPanel =
  | "pins"
  | "members"
  | "events"
  | "settings"
  | "thread"
  | "chart"
  | "file"
  | null;

const emptyCommunityDraft: CommunityDraft = { body: "" };

export type CommunityDestination = {
  channel: string;
  request: number;
  panel?: "pins";
};

export function CommunityView({
  team = "All teams",
  destination,
}: {
  team?: string;
  destination?: CommunityDestination;
}) {
  const [channels, setChannels] = useState(communityChannels);
  const [channelId, setChannelId] = useState("market-discussion");
  const [history, setHistory] =
    useState<Record<string, CommunityMessage[]>>(communityHistory);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<CommunityPanel>(null);
  const [threadId, setThreadId] = useState<string>();
  const [threads, setThreads] = useState<Record<string, CommunityMessage[]>>({
    "market-1": [
      {
        id: "market-reply-1",
        author: "marcus",
        time: "08:44",
        body: "The range gives us a useful reference for the session. I’ll wait for the briefing before updating my own plan.",
      },
      {
        id: "market-reply-2",
        author: "sara",
        time: "08:45",
        body: "Exactly. The chart is context for discussion; each account keeps its own risk settings.",
      },
    ],
  });
  const [reacted, setReacted] = useState<Record<string, Set<string>>>({});
  const [drafts, setDrafts] = useState<Record<string, CommunityDraft>>({});
  const [pollVotes, setPollVotes] = useState<
    Record<string, string | undefined>
  >({});
  const [read, setRead] = useState(new Set(["market-discussion"]));
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const [eventsJoined, setEventsJoined] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<Record<string, CommunityRole>>(
    Object.fromEntries(
      communityMembers.map((member) => [member.id, member.role]),
    ),
  );
  const [permissions, setPermissions] = useState(defaultCommunityPermissions);
  const [timedOut, setTimedOut] = useState<Set<string>>(new Set());
  const [slowMode, setSlowMode] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [voiceRoom, setVoiceRoom] = useState<string>();
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [status, setStatus] = useState("");
  const nextId = useRef(1);
  const feed = useRef<HTMLDivElement>(null);
  const priorCount = useRef(0);
  const micMutedBeforeDeafen = useRef(false);
  const channel = channels.find((item) => item.id === channelId) ?? channels[2];
  const messages = history[channelId] ?? [];
  const shown = messages.filter((message) =>
    `${message.body} ${communityMembers.find((member) => member.id === message.author)?.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const pinned = messages.filter((message) => message.pinned);
  const rootMessage = Object.values(history)
    .flat()
    .find((message) => message.id === threadId);
  const roomJoined = voiceRoom === channelId;
  const workspaceName = team === "All teams" ? "Azuriya Collective" : team;

  useEffect(() => {
    if (!destination) return;
    setChannelId(destination.channel);
    setSearch("");
    setRailOpen(false);
    setRead((current) => new Set([...current, destination.channel]));
    priorCount.current = 0;
    feed.current?.scrollTo({ top: 0 });
    setPanel(destination.panel ?? null);
  }, [destination]);

  useEffect(() => {
    if (messages.length > priorCount.current && priorCount.current > 0)
      feed.current?.scrollTo({
        top: feed.current.scrollHeight,
        behavior: "instant",
      });
    priorCount.current = messages.length;
  }, [channelId, messages.length]);
  useEffect(() => {
    if (!Object.values(cooldowns).some((value) => value > 0)) return;
    const timer = setTimeout(
      () =>
        setCooldowns((current) =>
          Object.fromEntries(
            Object.entries(current).map(([id, seconds]) => [
              id,
              Math.max(seconds - 1, 0),
            ]),
          ),
        ),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldowns]);

  const selectChannel = (id: string) => {
    setChannelId(id);
    setSearch("");
    setRailOpen(false);
    setRead((current) => new Set([...current, id]));
    priorCount.current = 0;
    feed.current?.scrollTo({ top: 0 });
  };
  const sendMessage = (
    body: string,
    attachment?: CommunityMessage["attachment"],
  ) => {
    const message = {
      id: `local-${nextId.current++}`,
      author: "you",
      time: "Now",
      body,
      attachment,
    };
    setHistory((current) => ({
      ...current,
      [channelId]: [...(current[channelId] ?? []), message],
    }));
    if (slowMode) setCooldowns((current) => ({ ...current, [channelId]: 30 }));
    setStatus("Message sent in this local preview.");
  };
  const sendReply = (
    body: string,
    attachment?: CommunityMessage["attachment"],
  ) => {
    if (!threadId) return;
    setThreads((current) => ({
      ...current,
      [threadId]: [
        ...(current[threadId] ?? []),
        {
          id: `reply-${nextId.current++}`,
          author: "you",
          time: "Now",
          body,
          attachment,
        },
      ],
    }));
    setStatus("Thread reply added in this local preview.");
  };
  const toggleReaction = (id: string, emoji: string) =>
    setReacted((current) => {
      const next = new Set(current[id] ?? []);
      if (next.has(emoji)) next.delete(emoji);
      else next.add(emoji);
      return { ...current, [id]: next };
    });
  const togglePin = (id: string) => {
    setHistory((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, items]) => [
          key,
          items.map((item) =>
            item.id === id ? { ...item, pinned: !item.pinned } : item,
          ),
        ]),
      ),
    );
    setStatus("Channel pins updated in this local preview.");
  };
  const openThread = (id: string) => {
    setThreadId(id);
    setPanel("thread");
  };
  const directMessage = (memberId: string) => {
    const person = communityMembers.find((member) => member.id === memberId);
    if (!person || memberId === "you") {
      setStatus(
        "You are signed in as the workspace administrator in this demo.",
      );
      return;
    }
    const id = `dm-${memberId}`;
    if (!channels.some((item) => item.id === id))
      setChannels((current) => [
        ...current,
        {
          id,
          name: person.name,
          kind: "dm",
          category: "DIRECT MESSAGES",
          topic: `A direct conversation with ${person.name}.`,
        },
      ]);
    selectChannel(id);
    setPanel(null);
  };
  const renderMessage = (message: CommunityMessage) => (
    <CommunityMessageRow
      key={message.id}
      message={message}
      roles={roles}
      reactions={reacted[message.id]}
      replyCount={threads[message.id]?.length ?? 0}
      pollVote={pollVotes[message.id]}
      onPollVote={(choice) =>
        setPollVotes((current) => ({ ...current, [message.id]: choice }))
      }
      onReaction={(emoji) => toggleReaction(message.id, emoji)}
      onPin={() => togglePin(message.id)}
      onThread={() => openThread(message.id)}
      onAttachment={() =>
        setPanel(message.attachment === "chart" ? "chart" : "file")
      }
    />
  );
  const toggleSet = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const leaveVoice = () => {
    setVoiceRoom(undefined);
    setMicMuted(false);
    setDeafened(false);
    setSharing(false);
    setStatus("Left the simulated voice room.");
  };

  return (
    <section className="dc-community" aria-label="Community workspace">
      <div className="dc-community-toolbar">
        <div>
          <span className="dc-community-workspace-mark">
            <UsersThree size={20} />
          </span>
          <span>
            <strong>{workspaceName}</strong>
            <small>Team communication workspace</small>
          </span>
          <span className="dc-community-demo-label">Local demo</span>
        </div>
        <div>
          <button
            onClick={() => setPanel("events")}
            aria-label="Community events"
          >
            <CalendarBlank size={18} />
            <span>Events</span>
          </button>
          <button
            onClick={() => setPanel("settings")}
            aria-label="Community settings"
          >
            <SlidersHorizontal size={18} />
            <span>Settings</span>
          </button>
        </div>
      </div>
      <div
        className={`dc-community-shell ${railOpen ? "dc-community-show-rail" : ""}`}
      >
        <aside className="dc-community-rail">
          <div className="dc-community-rail-heading">
            <strong>Channels</strong>
            <button
              aria-label="Create community channel"
              onClick={() => setPanel("settings")}
            >
              <Plus size={17} />
            </button>
            <button
              className="dc-community-mobile-close"
              aria-label="Close channel list"
              onClick={() => setRailOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <nav aria-label="Demo community channels">
            {[
              "INFORMATION",
              "TRADING DESK",
              "OPERATIONS",
              "VOICE ROOMS",
              "DIRECT MESSAGES",
            ].map((category) => (
              <div className="dc-community-channel-category" key={category}>
                <h4>{category}</h4>
                {channels
                  .filter((item) => item.category === category)
                  .map((item) => (
                    <button
                      key={item.id}
                      className="dc-community-channel"
                      aria-current={channelId === item.id ? "page" : undefined}
                      onClick={() => selectChannel(item.id)}
                    >
                      {item.kind === "voice" ? (
                        <SpeakerHigh size={17} />
                      ) : item.kind === "announcement" ? (
                        <Megaphone size={17} />
                      ) : item.kind === "dm" ? (
                        <CommunityAvatar
                          member={
                            communityMembers.find(
                              (member) => member.name === item.name,
                            ) ?? communityMembers[0]
                          }
                          small
                        />
                      ) : (
                        <Hash size={17} />
                      )}
                      <span>{item.name}</span>
                      {item.unread && !read.has(item.id) && (
                        <b>{item.unread}</b>
                      )}
                      {voiceRoom === item.id && (
                        <i aria-label="Joined voice room" />
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <div className="dc-community-self">
            <CommunityAvatar member={communityMembers[6]} small />
            <span>
              <strong>Workspace admin</strong>
              <small>Online · Moderator</small>
            </span>
            <ShieldCheck size={18} />
          </div>
        </aside>
        <section className="dd-message-panel dc-community-feed-panel">
          <header className="dc-community-channel-header">
            <button
              className="dc-community-channel-switch"
              aria-label="Open channel list"
              onClick={() => setRailOpen(!railOpen)}
            >
              <Hash size={19} />
              <CaretDown size={13} />
            </button>
            <div className="dc-community-channel-heading">
              <h3>
                {channel.kind === "voice" ? (
                  <SpeakerHigh size={20} />
                ) : channel.kind === "dm" ? (
                  <ChatCircleDots size={20} />
                ) : (
                  <Hash size={20} />
                )}
                {channel.name}
              </h3>
              <p>{channel.topic}</p>
            </div>
            <div className="dc-community-channel-actions">
              <button
                aria-label={
                  mutedChannels.has(channelId)
                    ? "Unmute channel notifications"
                    : "Mute channel notifications"
                }
                aria-pressed={mutedChannels.has(channelId)}
                onClick={() => {
                  setMutedChannels((current) => toggleSet(current, channelId));
                  setStatus(
                    mutedChannels.has(channelId)
                      ? "Channel notifications enabled"
                      : "Channel notifications muted",
                  );
                }}
              >
                {mutedChannels.has(channelId) ? (
                  <BellSlash size={18} />
                ) : (
                  <Bell size={18} />
                )}
              </button>
              <button
                aria-label="Pinned messages"
                onClick={() => setPanel("pins")}
              >
                <PushPin size={18} />
              </button>
              <button
                aria-label="Community members"
                onClick={() => setPanel("members")}
              >
                <UsersThree size={19} />
              </button>
            </div>
          </header>
          {channel.kind !== "voice" ? (
            <>
              <label className="dc-community-search">
                <MagnifyingGlass size={16} />
                <input
                  aria-label="Search messages"
                  placeholder={`Search ${channel.kind === "dm" ? "conversation" : `#${channel.name}`}`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    aria-label="Clear message search"
                    onClick={() => setSearch("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </label>
              {pinned.length > 0 && !search && (
                <button
                  className="dc-community-pin-notice"
                  onClick={() => setPanel("pins")}
                >
                  <PushPin size={15} />
                  <span>
                    {pinned.length} pinned{" "}
                    {pinned.length === 1 ? "message" : "messages"}
                  </span>
                  <span>View channel context</span>
                </button>
              )}
              <div
                className="dc-community-message-list"
                ref={feed}
                role="log"
                aria-label={`${channel.name} messages`}
                aria-live="polite"
              >
                <div className="dc-community-day-divider">
                  <span>Today · Session discussion</span>
                </div>
                {shown.length ? (
                  shown.map(renderMessage)
                ) : (
                  <div className="dc-community-empty">
                    <ChatCircleDots size={30} />
                    <h4>
                      {search
                        ? "No matching messages"
                        : `Welcome to ${channel.kind === "dm" ? channel.name : `#${channel.name}`}`}
                    </h4>
                    <p>
                      {search
                        ? "Try a name or a different keyword."
                        : "Start the conversation with a message or chart."}
                    </p>
                  </div>
                )}
              </div>
              {slowMode && (
                <p className="dc-community-slow-mode">
                  <ShieldCheck size={14} />
                  Slow mode is enabled
                  {(cooldowns[channelId] ?? 0) > 0
                    ? ` · Send again in ${cooldowns[channelId]} seconds`
                    : " · One message every 30 seconds"}
                </p>
              )}
              <CommunityComposer
                channel={
                  channel.kind === "dm" ? channel.name : `#${channel.name}`
                }
                draft={drafts[`channel:${channelId}`] ?? emptyCommunityDraft}
                onDraftChange={(draft) =>
                  setDrafts((current) => ({
                    ...current,
                    [`channel:${channelId}`]: draft,
                  }))
                }
                onSend={sendMessage}
                disabled={slowMode && (cooldowns[channelId] ?? 0) > 0}
              />
            </>
          ) : (
            <div className="dc-community-voice-room">
              <div className="dc-community-voice-room-heading">
                <span>
                  <SpeakerHigh size={24} />
                </span>
                <h4>{channel.name}</h4>
                <p>
                  Room controls are simulated. No microphone, camera or screen
                  is accessed.
                </p>
              </div>
              <CommunityVoicePeople joined={roomJoined} />
              <div className="dc-community-voice-state">
                <span>
                  <i />
                  {roomJoined
                    ? "You joined the demo room"
                    : "3 example participants"}
                </span>
                {sharing && (
                  <span>
                    <MonitorArrowUp size={15} />
                    Screen sharing preview active
                  </span>
                )}
              </div>
              <div className="dc-community-voice-controls">
                {roomJoined ? (
                  <>
                    <button
                      aria-label={
                        deafened
                          ? "Microphone muted while deafened"
                          : micMuted
                            ? "Unmute microphone preview"
                            : "Mute microphone preview"
                      }
                      aria-pressed={micMuted}
                      disabled={deafened}
                      aria-description={
                        deafened
                          ? "Undeafen the room before unmuting your microphone."
                          : undefined
                      }
                      onClick={() => setMicMuted(!micMuted)}
                    >
                      {micMuted ? (
                        <MicrophoneSlash size={20} />
                      ) : (
                        <Microphone size={20} />
                      )}
                      <span>
                        {deafened ? "Muted" : micMuted ? "Unmute" : "Mute"}
                      </span>
                    </button>
                    <button
                      aria-label={
                        deafened
                          ? "Undeafen voice preview"
                          : "Deafen voice preview"
                      }
                      aria-pressed={deafened}
                      onClick={() => {
                        if (deafened) {
                          setDeafened(false);
                          setMicMuted(micMutedBeforeDeafen.current);
                        } else {
                          micMutedBeforeDeafen.current = micMuted;
                          setDeafened(true);
                          setMicMuted(true);
                        }
                      }}
                    >
                      {deafened ? (
                        <SpeakerSlash size={20} />
                      ) : (
                        <Headphones size={20} />
                      )}
                      <span>{deafened ? "Undeafen" : "Deafen"}</span>
                    </button>
                    <button
                      aria-label={
                        sharing
                          ? "Stop screen sharing preview"
                          : "Start screen sharing preview"
                      }
                      aria-pressed={sharing}
                      onClick={() => setSharing(!sharing)}
                    >
                      <MonitorArrowUp size={20} />
                      <span>{sharing ? "Stop sharing" : "Share screen"}</span>
                    </button>
                    <button className="dc-community-leave" onClick={leaveVoice}>
                      <PhoneDisconnect size={20} />
                      <span>Leave room</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="dc-community-button"
                    onClick={() => {
                      setVoiceRoom(channelId);
                      setMicMuted(false);
                      setDeafened(false);
                      setSharing(false);
                      setStatus("Joined the simulated voice room.");
                    }}
                  >
                    <Headphones size={19} />
                    Join demo room
                  </button>
                )}
              </div>
            </div>
          )}
          {voiceRoom && channel.kind !== "voice" && (
            <div className="dc-community-connected-voice">
              <span>
                <SpeakerHigh size={17} />
                In {channels.find((item) => item.id === voiceRoom)?.name} · demo
              </span>
              <button onClick={() => selectChannel(voiceRoom)}>
                Open room
              </button>
              <button
                aria-label="Leave simulated voice room"
                onClick={leaveVoice}
              >
                <PhoneDisconnect size={18} />
              </button>
            </div>
          )}
        </section>
        <aside className="dc-community-members" aria-label="Member presence">
          <div className="dc-community-members-heading">
            <strong>Members</strong>
            <span>5 online</span>
          </div>
          <CommunityMemberList
            roles={roles}
            timedOut={timedOut}
            onDirectMessage={directMessage}
          />
          <div className="dc-community-member-note">
            <ShieldCheck size={18} />
            <strong>Role-based access</strong>
            <p>Give each team member the permissions they need.</p>
            <button onClick={() => setPanel("settings")}>Manage roles</button>
          </div>
        </aside>
      </div>
      <div className="dc-community-footnote">
        <span>
          <CheckCircle size={14} />
          Messages, roles and events stay in this local preview.
        </span>
        <span role="status" aria-live="polite">
          {status ||
            (mutedChannels.has(channelId)
              ? "Channel notifications muted"
              : "Channel notifications enabled")}
        </span>
      </div>
      {panel && (
        <CommunityDialog
          title={
            panel === "pins"
              ? "Pinned messages"
              : panel === "members"
                ? "Community members"
                : panel === "events"
                  ? "Community events"
                  : panel === "settings"
                    ? "Community settings"
                    : panel === "thread"
                      ? "Message thread"
                      : panel === "chart"
                        ? "Session chart"
                        : "Session briefing"
          }
          onClose={() => setPanel(null)}
          wide={panel === "settings" || panel === "chart"}
        >
          {panel === "pins" && (
            <div className="dc-community-pins">
              <p className="dc-community-panel-description">
                Pinned context for{" "}
                {channel.kind === "dm" ? channel.name : `#${channel.name}`}.
              </p>
              {pinned.length ? (
                pinned.map(renderMessage)
              ) : (
                <div className="dc-community-empty">
                  <PushPin size={30} />
                  <h4>No pinned messages</h4>
                  <p>Use the pin control beside a message to keep it here.</p>
                </div>
              )}
            </div>
          )}
          {panel === "members" && (
            <CommunityMemberList
              roles={roles}
              timedOut={timedOut}
              onDirectMessage={directMessage}
            />
          )}
          {panel === "events" && (
            <CommunityEvents
              joined={eventsJoined}
              onToggle={(id) =>
                setEventsJoined((current) => toggleSet(current, id))
              }
            />
          )}
          {panel === "settings" && (
            <CommunitySettings
              channels={channels}
              roles={roles}
              permissions={permissions}
              timedOut={timedOut}
              slowMode={slowMode}
              onSlowMode={setSlowMode}
              onCreate={(name, kind) => {
                const id = `channel-${nextId.current++}`;
                setChannels((current) => [
                  ...current,
                  {
                    id,
                    name,
                    kind,
                    category: kind === "voice" ? "VOICE ROOMS" : "TRADING DESK",
                    topic: "A new space for your community.",
                  },
                ]);
                selectChannel(id);
                setStatus(`Created ${name} in the local preview.`);
                setPanel(null);
              }}
              onRole={(id, role) =>
                setRoles((current) => ({ ...current, [id]: role }))
              }
              onPermission={(role, permission) =>
                setPermissions((current) => ({
                  ...current,
                  [role]: current[role].includes(permission)
                    ? current[role].filter((item) => item !== permission)
                    : [...current[role], permission],
                }))
              }
              onTimeout={(id) =>
                setTimedOut((current) => toggleSet(current, id))
              }
            />
          )}
          {panel === "thread" && rootMessage && (
            <div className="dc-community-thread">
              <div className="dc-community-thread-root">
                <CommunityMessageRow
                  message={rootMessage}
                  roles={roles}
                  pollVote={pollVotes[rootMessage.id]}
                  onPollVote={(choice) =>
                    setPollVotes((current) => ({
                      ...current,
                      [rootMessage.id]: choice,
                    }))
                  }
                  onAttachment={() =>
                    setPanel(
                      rootMessage.attachment === "chart" ? "chart" : "file",
                    )
                  }
                />
              </div>
              <div className="dc-community-thread-divider">
                {threads[rootMessage.id]?.length ?? 0} replies
              </div>
              <div
                className="dc-community-thread-replies"
                role="log"
                aria-label="Thread replies"
                aria-live="polite"
              >
                {(threads[rootMessage.id] ?? []).map((reply) => (
                  <CommunityMessageRow
                    key={reply.id}
                    message={reply}
                    roles={roles}
                    pollVote={pollVotes[reply.id]}
                    onPollVote={(choice) =>
                      setPollVotes((current) => ({
                        ...current,
                        [reply.id]: choice,
                      }))
                    }
                    onAttachment={() =>
                      setPanel(reply.attachment === "chart" ? "chart" : "file")
                    }
                  />
                ))}
              </div>
              <CommunityComposer
                channel={rootMessage.id}
                draft={
                  drafts[`thread:${rootMessage.id}`] ?? emptyCommunityDraft
                }
                onDraftChange={(draft) =>
                  setDrafts((current) => ({
                    ...current,
                    [`thread:${rootMessage.id}`]: draft,
                  }))
                }
                thread
                onSend={sendReply}
              />
            </div>
          )}
          {panel === "chart" && (
            <>
              <CommunityChart expanded />
              <p className="dc-community-panel-description">
                An illustrative session map shared by the team. Chart prices are
                display examples; this attachment does not submit an order.
              </p>
            </>
          )}
          {panel === "file" && (
            <article className="dc-community-file-preview">
              <span className="dc-community-file-tag">
                PDF PREVIEW · EXAMPLE
              </span>
              <h4>Session briefing</h4>
              <p>Research notes & community checklist</p>
              <ol>
                <li>
                  <strong>Session map</strong>
                  <span>
                    Review the market context and reference range in the
                    annotated chart.
                  </span>
                </li>
                <li>
                  <strong>Account rules</strong>
                  <span>
                    Check your own drawdown, position size and trading limits.
                  </span>
                </li>
                <li>
                  <strong>Team communication</strong>
                  <span>
                    Share your reasoning in a thread. Keep personal account
                    details private.
                  </span>
                </li>
                <li>
                  <strong>After the session</strong>
                  <span>
                    Record the review and bring questions to the team lounge.
                  </span>
                </li>
              </ol>
            </article>
          )}
        </CommunityDialog>
      )}
    </section>
  );
}
