export type CommunityRole =
  | "Community owner"
  | "Moderator"
  | "Trader"
  | "Support";
export type CommunityChannel = {
  id: string;
  name: string;
  kind: "text" | "announcement" | "voice" | "dm";
  topic: string;
  category: string;
  unread?: string;
};
export type CommunityMessage = {
  id: string;
  author: string;
  body: string;
  time: string;
  pinned?: boolean;
  attachment?: "chart" | "file" | "poll";
  reactions?: { emoji: string; count: number }[];
};
export type CommunityMember = {
  id: string;
  name: string;
  initials: string;
  role: CommunityRole;
  presence: "Online" | "Away" | "Offline";
  detail: string;
  tone: string;
};

export const communityMembers: CommunityMember[] = [
  {
    id: "alex",
    name: "Alex Morgan",
    initials: "AM",
    role: "Community owner",
    presence: "Online",
    detail: "Gold Elite · MT5",
    tone: "blue",
  },
  {
    id: "sara",
    name: "Sara Chen",
    initials: "SC",
    role: "Moderator",
    presence: "Online",
    detail: "Market analysis",
    tone: "green",
  },
  {
    id: "marcus",
    name: "Marcus Reed",
    initials: "MR",
    role: "Trader",
    presence: "Online",
    detail: "FX Intraday · cTrader",
    tone: "sand",
  },
  {
    id: "nina",
    name: "Nina Patel",
    initials: "NP",
    role: "Support",
    presence: "Online",
    detail: "Accounts & funding",
    tone: "rose",
  },
  {
    id: "daniel",
    name: "Daniel Brooks",
    initials: "DB",
    role: "Trader",
    presence: "Away",
    detail: "Prop firm evaluation",
    tone: "gray",
  },
  {
    id: "leo",
    name: "Leo Williams",
    initials: "LW",
    role: "Trader",
    presence: "Offline",
    detail: "Scalping Pro",
    tone: "blue",
  },
  {
    id: "you",
    name: "You",
    initials: "AZ",
    role: "Moderator",
    presence: "Online",
    detail: "Workspace administrator",
    tone: "blue",
  },
];

export const communityChannels: CommunityChannel[] = [
  {
    id: "announcements",
    name: "announcements",
    kind: "announcement",
    category: "INFORMATION",
    topic: "Community updates, trading schedules and platform notices.",
    unread: "2",
  },
  {
    id: "getting-started",
    name: "getting-started",
    kind: "text",
    category: "INFORMATION",
    topic: "Your first account, community rules and useful resources.",
  },
  {
    id: "market-discussion",
    name: "market-discussion",
    kind: "text",
    category: "TRADING DESK",
    topic: "Share your outlook. Discuss setups. Keep risk in focus.",
    unread: "4",
  },
  {
    id: "trade-setups",
    name: "trade-setups",
    kind: "text",
    category: "TRADING DESK",
    topic: "Annotated charts and trade ideas from the team.",
  },
  {
    id: "account-support",
    name: "account-support",
    kind: "text",
    category: "OPERATIONS",
    topic: "Get help with accounts, deposits, withdrawals and platform access.",
    unread: "1",
  },
  {
    id: "london-session",
    name: "London session",
    kind: "voice",
    category: "VOICE ROOMS",
    topic: "A shared room for the European session.",
  },
  {
    id: "team-lounge",
    name: "Team lounge",
    kind: "voice",
    category: "VOICE ROOMS",
    topic: "Team conversations and end-of-day reviews.",
  },
  {
    id: "dm-sara",
    name: "Sara Chen",
    kind: "dm",
    category: "DIRECT MESSAGES",
    topic: "A direct conversation with Sara Chen.",
  },
  {
    id: "dm-nina",
    name: "Nina Patel",
    kind: "dm",
    category: "DIRECT MESSAGES",
    topic: "A direct conversation with Nina Patel.",
  },
];

export const communityHistory: Record<string, CommunityMessage[]> = {
  "market-discussion": [
    {
      id: "market-1",
      author: "sara",
      time: "08:43",
      body: "London open is approaching. Gold is holding the previous session range; I’m watching the marked area before making any decisions.",
      attachment: "chart",
      pinned: true,
      reactions: [
        { emoji: "📈", count: 8 },
        { emoji: "👍", count: 5 },
      ],
    },
    {
      id: "market-2",
      author: "alex",
      time: "08:46",
      body: "Good context, Sara. Keep your individual risk limits active. A setup shared here doesn’t place a trade or change your account settings.",
      attachment: "poll",
      reactions: [{ emoji: "✅", count: 6 }],
    },
    {
      id: "market-3",
      author: "marcus",
      time: "08:49",
      body: "I’m joining the London session voice room for the walkthrough. I’ll share the EURUSD levels in #trade-setups after the review.",
    },
  ],
  announcements: [
    {
      id: "announce-1",
      author: "alex",
      time: "08:15",
      body: "Welcome to the Azuriya workspace. Trading accounts, team conversations and funding requests now have a shared home. Start in #getting-started if you’re new here.",
      pinned: true,
      reactions: [{ emoji: "👍", count: 12 }],
    },
    {
      id: "announce-2",
      author: "sara",
      time: "08:30",
      body: "Today’s market briefing is at 09:00. Open Events to RSVP and review the agenda. The recording checklist is attached.",
      attachment: "file",
    },
  ],
  "getting-started": [
    {
      id: "start-1",
      author: "nina",
      time: "08:20",
      body: "Start with your profile and account verification. Then link your trading platform from Accounts. Funding status is available in the Funding view.",
      pinned: true,
    },
    {
      id: "start-2",
      author: "sara",
      time: "08:27",
      body: "Community guidelines: explain your ideas, avoid posting personal account details and keep discussions respectful. Ask a moderator if you need help.",
      attachment: "file",
    },
  ],
  "trade-setups": [
    {
      id: "setup-1",
      author: "marcus",
      time: "08:31",
      body: "Gold session map for the review. The shaded area is a reference range; this is an illustrative chart, not an executable signal.",
      attachment: "chart",
      reactions: [{ emoji: "📈", count: 4 }],
    },
    {
      id: "setup-2",
      author: "sara",
      time: "08:40",
      body: "Please include timeframe, invalidation and your reasoning when sharing a setup. Use a thread for follow-up questions.",
    },
  ],
  "account-support": [
    {
      id: "support-1",
      author: "daniel",
      time: "08:35",
      body: "Where can I check the status of my withdrawal request?",
    },
    {
      id: "support-2",
      author: "nina",
      time: "08:38",
      body: "Open Funding, select Withdrawals and find your request. You can see the review stage and reference there. Please keep payment details out of the public channel.",
      pinned: true,
      reactions: [{ emoji: "✅", count: 3 }],
    },
    {
      id: "support-3",
      author: "daniel",
      time: "08:39",
      body: "Found it, thank you. The status and reference are both visible.",
    },
  ],
  "dm-sara": [
    {
      id: "dm-sara-1",
      author: "sara",
      time: "08:47",
      body: "The session chart is ready for the briefing. Could you check the pinned note before we start?",
      attachment: "chart",
    },
    {
      id: "dm-sara-2",
      author: "you",
      time: "08:50",
      body: "Yes, the context is clear. Let’s keep the discussion focused on the plan and risk limits.",
    },
  ],
  "dm-nina": [
    {
      id: "dm-nina-1",
      author: "nina",
      time: "08:44",
      body: "The account support guide has been updated. I’ve included the steps for finding a funding request and contacting support.",
      attachment: "file",
    },
  ],
};

export const communityEvents = [
  {
    id: "london-briefing",
    title: "London market briefing",
    day: "TODAY",
    time: "09:00 – 09:30",
    host: "Sara Chen",
    room: "London session",
    attendees: "18",
    description: "Gold and FX session map, market context and questions.",
  },
  {
    id: "risk-review",
    title: "Prop firm risk clinic",
    day: "TOMORROW",
    time: "15:30 – 16:00",
    host: "Alex Morgan",
    room: "Team lounge",
    attendees: "12",
    description: "Evaluation limits, drawdown rules and account discipline.",
  },
];
