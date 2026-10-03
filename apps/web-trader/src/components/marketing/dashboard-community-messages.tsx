"use client";

import {
  ChartLineUp,
  ChatCircle,
  FilePdf,
  PushPin,
  PushPinSlash,
  Smiley,
} from "@phosphor-icons/react";
import {
  communityMembers,
  type CommunityMember,
  type CommunityMessage,
} from "./dashboard-community-data";

export function CommunityAvatar({
  member,
  small = false,
}: {
  member: CommunityMember;
  small?: boolean;
}) {
  return (
    <span
      className={`dc-community-avatar dc-community-avatar-${member.tone} ${small ? "dc-community-avatar-small" : ""}`}
      aria-hidden="true"
    >
      {member.initials}
      <i data-presence={member.presence} />
    </span>
  );
}

export function CommunityChart({ expanded = false }: { expanded?: boolean }) {
  const candles = [
    [26, 95, 88, 117, 78],
    [45, 88, 102, 118, 76],
    [64, 102, 94, 113, 82],
    [83, 94, 79, 99, 62],
    [102, 79, 69, 88, 53],
    [121, 69, 83, 95, 58],
    [140, 83, 76, 89, 68],
    [159, 76, 91, 104, 67],
    [178, 91, 80, 102, 71],
    [197, 80, 63, 88, 54],
    [216, 63, 57, 72, 43],
    [235, 57, 70, 84, 46],
    [254, 70, 58, 79, 48],
    [273, 58, 47, 66, 35],
    [292, 47, 55, 70, 40],
    [311, 55, 39, 63, 29],
    [330, 39, 47, 58, 30],
    [349, 47, 36, 56, 25],
  ];
  return (
    <figure
      className={`dc-community-chart ${expanded ? "dc-community-chart-expanded" : ""}`}
    >
      <figcaption>
        <span>
          <ChartLineUp size={17} />
          <strong>XAUUSD</strong>
          <span>M15 · Session map</span>
        </span>
        <span>Illustrative chart</span>
      </figcaption>
      <svg
        viewBox="0 0 430 160"
        role="img"
        aria-label="Annotated Gold session candlestick chart, with a highlighted reference range and rising price path"
      >
        {[28, 58, 88, 118].map((y) => (
          <line
            key={y}
            x1="14"
            x2="365"
            y1={y}
            y2={y}
            className="dc-community-chart-grid"
          />
        ))}
        {[50, 125, 200, 275, 350].map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1="14"
            y2="130"
            className="dc-community-chart-grid"
          />
        ))}
        <rect
          x="15"
          y="81"
          width="350"
          height="22"
          className="dc-community-chart-zone"
        />
        <text x="22" y="98" className="dc-community-chart-label">
          Session reference range
        </text>
        {candles.map(([x, open, close, low, high]) => (
          <g
            key={x}
            className={
              close < open
                ? "dc-community-candle-up"
                : "dc-community-candle-down"
            }
          >
            <line x1={x} x2={x} y1={high} y2={low} />
            <rect
              x={x - 4}
              y={Math.min(open, close)}
              width="8"
              height={Math.max(Math.abs(open - close), 3)}
              rx="1"
            />
          </g>
        ))}
        <line
          x1="15"
          x2="365"
          y1="36"
          y2="36"
          className="dc-community-chart-current"
        />
        <rect
          x="372"
          y="26"
          width="53"
          height="20"
          rx="3"
          className="dc-community-chart-price"
        />
        <text
          x="399"
          y="40"
          textAnchor="middle"
          className="dc-community-chart-price-text"
        >
          2,648.50
        </text>
        <text x="382" y="64" className="dc-community-chart-label">
          2,646.00
        </text>
        <text x="382" y="94" className="dc-community-chart-label">
          2,643.50
        </text>
        <text x="382" y="124" className="dc-community-chart-label">
          2,641.00
        </text>
        <text x="18" y="148" className="dc-community-chart-label">
          07:00
        </text>
        <text x="125" y="148" className="dc-community-chart-label">
          07:30
        </text>
        <text x="237" y="148" className="dc-community-chart-label">
          08:00
        </text>
        <text x="335" y="148" className="dc-community-chart-label">
          08:30
        </text>
      </svg>
      <div className="dc-community-chart-note">
        <span>
          <i />
          Reference levels marked
        </span>
        <span>Gold session · 284 KB</span>
      </div>
    </figure>
  );
}

function CommunityPoll({
  vote,
  onVote,
}: {
  vote?: string;
  onVote?: (choice?: string) => void;
}) {
  const choices = [
    { label: "Gold session map", votes: 9 },
    { label: "FX market context", votes: 6 },
    { label: "Prop firm risk review", votes: 3 },
  ];
  const total = 18 + (vote ? 1 : 0);
  return (
    <div className="dc-community-poll">
      <strong>What should we cover in the next briefing?</strong>
      <span>Community poll · Choose one</span>
      <div>
        {choices.map((choice) => {
          const count = choice.votes + (vote === choice.label ? 1 : 0);
          const percentage = Math.round((count / total) * 100);
          return (
            <button
              key={choice.label}
              aria-label={`Vote for ${choice.label}`}
              aria-pressed={vote === choice.label}
              onClick={() =>
                onVote?.(vote === choice.label ? undefined : choice.label)
              }
              disabled={!onVote}
            >
              <i style={{ width: `${percentage}%` }} />
              <span>{choice.label}</span>
              <strong>{percentage}%</strong>
            </button>
          );
        })}
      </div>
      <small>
        {total} votes ·{" "}
        {vote ? `You voted for ${vote}` : "Your vote stays in this preview"}
      </small>
    </div>
  );
}

export function CommunityAttachment({
  type,
  onOpen,
  pollVote,
  onPollVote,
}: {
  type: CommunityMessage["attachment"];
  onOpen?: () => void;
  pollVote?: string;
  onPollVote?: (choice?: string) => void;
}) {
  if (type === "chart")
    return (
      <button
        className="dc-community-attachment-chart"
        aria-label="Open session chart attachment"
        onClick={onOpen}
      >
        <CommunityChart />
      </button>
    );
  if (type === "file")
    return (
      <button
        className="dc-community-file"
        onClick={onOpen}
        aria-label="Open session briefing attachment"
      >
        <span>
          <FilePdf size={26} />
        </span>
        <span>
          <strong>Session briefing.pdf</strong>
          <small>Research & community guidelines · 1.2 MB</small>
        </span>
        <FilePdf size={18} />
      </button>
    );
  if (type === "poll")
    return <CommunityPoll vote={pollVote} onVote={onPollVote} />;
  return null;
}

export function CommunityMessageRow({
  message,
  onThread,
  onPin,
  onReaction,
  reactions,
  replyCount,
  onAttachment,
  pollVote,
  onPollVote,
  roles,
}: {
  message: CommunityMessage;
  onThread?: () => void;
  onPin?: () => void;
  onReaction?: (emoji: string) => void;
  reactions?: Set<string>;
  replyCount?: number;
  onAttachment?: () => void;
  pollVote?: string;
  onPollVote?: (choice?: string) => void;
  roles?: Record<string, string>;
}) {
  const author =
    communityMembers.find((member) => member.id === message.author) ??
    communityMembers[0];
  const baseReactions = message.reactions?.length
    ? message.reactions
    : [{ emoji: "👍", count: 0 }];
  const emojiList = [
    ...baseReactions,
    ...[...(reactions ?? [])]
      .filter(
        (emoji) => !baseReactions.some((reaction) => reaction.emoji === emoji),
      )
      .map((emoji) => ({ emoji, count: 0 })),
  ];
  return (
    <article className="dc-community-message" data-message-id={message.id}>
      <CommunityAvatar member={author} />
      <div className="dc-community-message-content">
        <div className="dc-community-message-author">
          <strong>{author.name}</strong>
          <span className="dc-community-role">
            {roles?.[author.id] ?? author.role}
          </span>
          <time>{message.time}</time>
          {message.pinned && (
            <span className="dc-community-pinned-label">
              <PushPin size={12} />
              Pinned
            </span>
          )}
        </div>
        <p>{message.body}</p>
        {message.attachment && (
          <CommunityAttachment
            type={message.attachment}
            onOpen={onAttachment}
            pollVote={pollVote}
            onPollVote={onPollVote}
          />
        )}
        <div className="dc-community-message-footer">
          {onReaction && (
            <div className="dc-community-reactions">
              {emojiList.map((reaction) => (
                <button
                  key={reaction.emoji}
                  aria-label={`React ${reaction.emoji} to ${author.name}'s message`}
                  aria-pressed={reactions?.has(reaction.emoji) ?? false}
                  onClick={() => onReaction(reaction.emoji)}
                >
                  <span>{reaction.emoji}</span>
                  <span>
                    {reaction.count + (reactions?.has(reaction.emoji) ? 1 : 0)}
                  </span>
                </button>
              ))}
              <button
                className="dc-community-reaction-add"
                aria-label={`Add thumbs-up reaction to ${author.name}'s message`}
                aria-pressed={reactions?.has("👍") ?? false}
                onClick={() => onReaction("👍")}
              >
                <Smiley size={16} />
                <span>+</span>
              </button>
            </div>
          )}
          <div className="dc-community-message-actions">
            {onThread && (
              <button
                onClick={onThread}
                aria-label={`Reply in thread to ${author.name}'s message`}
              >
                <ChatCircle size={15} />
                <span>{replyCount ? `${replyCount} replies` : "Reply"}</span>
              </button>
            )}
            {onPin && (
              <button
                onClick={onPin}
                aria-label={`${message.pinned ? "Unpin" : "Pin"} ${author.name}'s message`}
                aria-pressed={message.pinned ?? false}
              >
                {message.pinned ? (
                  <PushPinSlash size={15} />
                ) : (
                  <PushPin size={15} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
