import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowsLeftRight,
  Bank,
  ChatCircleText,
  CheckCircle,
  CreditCard,
  Hash,
  LockKey,
  SlidersHorizontal,
  Triangle,
  UserCircle,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import { FlowTracks } from "./flow-tracks";
import "./operations-graphics.css";

function PlatformMark({ file, label }: { file: string; label: string }) {
  return (
    <span className="og-platform-mark">
      <Image
        src={`/marketing/platforms/${file}`}
        alt={label}
        width={32}
        height={32}
        unoptimized
      />
    </span>
  );
}

function FundingConnections() {
  const fundingPaths = [
    "M125 45 H260 Q290 45 290 71 H500",
    "M125 101 H260 Q290 101 290 71 H500",
    "M500 71 H710 Q740 71 740 45 H875",
    "M500 71 H710 Q740 71 740 101 H875",
  ];
  return (
    <div
      className="og-funding-network"
      aria-label="Illustrative deposits flow from bank and card payments through the portal wallet to MetaTrader 5 and cTrader accounts. Withdrawals follow the same routes in reverse."
      role="img"
    >
      <div className="og-funding-diagram">
        <FlowTracks
          id="funding-deposit"
          className="og-funding-tracks"
          viewBox="0 0 1000 160"
          paths={fundingPaths}
        />
        <FlowTracks
          id="funding-withdrawal"
          className="og-funding-tracks og-funding-return"
          viewBox="0 0 1000 160"
          paths={fundingPaths}
          reverse
          delay={2}
        />
        <div className="og-payment-rails">
          <span>
            <Bank size={25} weight="duotone" />
          </span>
          <span>
            <CreditCard size={25} weight="duotone" />
          </span>
          <small>Payment rails</small>
        </div>
        <div className="og-funding-hub">
          <span className="og-wallet-mark">
            <Wallet size={36} weight="duotone" />
          </span>
          <strong>Portal wallet</strong>
          <small>Deposit / withdraw</small>
        </div>
        <div className="og-funding-accounts">
          <PlatformMark file="metatrader-5.png" label="MetaTrader 5" />
          <PlatformMark file="ctrader.ico" label="cTrader" />
          <small>Trading accounts</small>
        </div>
      </div>
      <div className="og-funding-legend">
        <span>
          Deposits <ArrowRight size={13} />
        </span>
        <span>
          <ArrowLeft size={13} /> Withdrawals
        </span>
      </div>
    </div>
  );
}

function CommunityPresence() {
  return (
    <div className="og-community-presence">
      <div className="og-member-orbit" aria-hidden="true">
        <UsersThree
          className="og-community-symbol"
          size={44}
          weight="duotone"
        />
        <span className="og-orbit-member og-orbit-first">
          <UserCircle size={32} weight="duotone" />
        </span>
        <span className="og-orbit-member og-orbit-second">
          <UserCircle size={32} weight="duotone" />
        </span>
        <span className="og-orbit-member og-orbit-third">
          <UserCircle size={32} weight="duotone" />
        </span>
      </div>
      <div>
        <strong>Your community, together.</strong>
        <div className="og-presence-line">
          <span className="og-avatar-stack" aria-hidden="true">
            <span>AM</span>
            <span>JL</span>
            <span>RK</span>
            <span>+5</span>
          </span>
          <span>823 members</span>
        </div>
      </div>
    </div>
  );
}

function BackendConnections() {
  return (
    <div
      className="og-backend-network"
      aria-label="Example unified administration across platform backends"
    >
      <div className="og-backend-platforms">
        {[
          ["metatrader-5.png", "MT5"],
          ["ctrader.ico", "cTrader"],
          ["dxtrade.png", "DXtrade"],
          ["match-trader.png", "Match-Trader"],
        ].map(([file, name]) => (
          <div key={name}>
            <PlatformMark file={file} label={name} />
            <span>{name}</span>
          </div>
        ))}
      </div>
      <FlowTracks
        id="admin-platform"
        className="og-backend-tracks"
        viewBox="0 0 1000 60"
        paths={[
          "M0 0 V16 Q0 22 12 22 H488 Q500 22 500 34 V60",
          "M333.333 0 V16 Q333.333 22 345.333 22 H488 Q500 22 500 34 V60",
          "M666.667 0 V16 Q666.667 22 654.667 22 H512 Q500 22 500 34 V60",
          "M1000 0 V16 Q1000 22 988 22 H512 Q500 22 500 34 V60",
        ]}
      />
      <div className="og-admin-hub">
        <Triangle size={21} weight="fill" />
        <span>Azuriya Admin Portal</span>
        <SlidersHorizontal size={20} />
      </div>
    </div>
  );
}

export function PortalOperations() {
  return (
    <section
      className="az-section az-container ab-operations og-operations"
      id="operations"
      aria-labelledby="operations-title"
    >
      <div className="ab-section-heading">
        <div>
          <div className="az-eyebrow">
            <ArrowsLeftRight size={17} /> THE BUSINESS AROUND THE TRADE
          </div>
          <h2 id="operations-title">
            Move funds. Start conversations.
            <br />
            <span>Keep your community together.</span>
          </h2>
        </div>
        <p>
          Deposits, withdrawals and member chat belong beside your trading
          accounts. Give people one destination for their money, their team and
          their next conversation.
        </p>
      </div>
      <div className="ab-operation-grid">
        <article className="ab-operation-card">
          <div className="ab-operation-copy">
            <Wallet size={27} />
            <h3>Funding, in the same portal.</h3>
            <p>
              Manage deposit and withdrawal requests with account context, clear
              statuses and a shared view for your operations team.
            </p>
          </div>
          <div
            className="ab-funding-preview"
            aria-label="Illustrative deposit and withdrawal requests"
          >
            <div className="ab-preview-heading">
              <span>Funding activity</span>
              <span className="az-preview-tag">DEMO DATA</span>
            </div>
            <FundingConnections />
            {[
              {
                name: "Alex Morgan",
                account: "MT5 · #23192",
                type: "Deposit",
                amount: "$2,500.00",
                status: "Completed",
              },
              {
                name: "Ryan Mitchell",
                account: "Connected account · #18273",
                type: "Withdrawal",
                amount: "$800.00",
                status: "In review",
              },
              {
                name: "James Carter",
                account: "MT5 · #92731",
                type: "Deposit",
                amount: "$1,000.00",
                status: "Completed",
              },
            ].map((item) => (
              <div className="ab-funding-row" key={item.name}>
                <span
                  className={`ab-funding-icon ${item.type === "Withdrawal" ? "ab-outgoing" : ""}`}
                >
                  {item.type === "Deposit" ? (
                    <ArrowDownLeft size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </span>
                <span className="ab-funding-person">
                  <strong>{item.name}</strong>
                  <small>{item.account}</small>
                </span>
                <span className="ab-funding-amount">
                  <strong>{item.amount}</strong>
                  <small>{item.type}</small>
                </span>
                <span
                  className={`ab-funding-status ${item.status === "In review" ? "ab-in-review" : ""}`}
                >
                  {item.status}
                </span>
              </div>
            ))}
            <div className="ab-preview-note">
              <LockKey size={14} /> Example workflow. No funds are moved.
            </div>
          </div>
        </article>
        <article className="ab-operation-card">
          <div className="ab-operation-copy">
            <ChatCircleText size={27} />
            <h3>A community that stays connected.</h3>
            <p>
              Member conversations, team channels and announcements. Build the
              community experience your traders know from Discord, inside your
              portal.
            </p>
          </div>
          <div className="ab-chat-preview" aria-label="Illustrative team chat">
            <div className="ab-preview-heading">
              <span>
                <Hash size={17} /> market-discussion
              </span>
              <span className="az-preview-tag">DEMO DATA</span>
            </div>
            <CommunityPresence />
            <div
              className="og-community-channels"
              aria-label="Example community channels"
            >
              <span>
                <Hash size={13} /> announcements
              </span>
              <span>
                <Hash size={13} /> market-discussion
              </span>
              <span>
                <Hash size={13} /> gold-elite
              </span>
            </div>
            <div className="ab-chat-message">
              <span className="az-avatar az-avatar-blue">AM</span>
              <div>
                <p>
                  <strong>Alex Morgan</strong>
                  <small>Community head · 09:41</small>
                </p>
                <span>
                  Morning, team. Today’s market brief is ready in announcements.
                </span>
              </div>
            </div>
            <div className="ab-chat-message">
              <span className="az-avatar">JL</span>
              <div>
                <p>
                  <strong>Jamie Lee</strong>
                  <small>Member · 09:43</small>
                </p>
                <span>
                  Thanks, Alex. Good to have the team and our accounts in one
                  place.
                </span>
              </div>
            </div>
            <div className="ab-chat-compose">
              <ChatCircleText size={17} />
              <span>Your members. Your conversations.</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function AdministrationPreview() {
  return (
    <section
      className="az-section az-container az-split-section ab-administration og-administration"
      id="admin"
      aria-labelledby="admin-title"
    >
      <div className="az-section-copy">
        <div className="az-eyebrow">
          <SlidersHorizontal size={17} /> YOUR BUSINESS. YOUR SETTINGS.
        </div>
        <h2 id="admin-title">
          Your community head.
          <br />
          <span>In complete control.</span>
        </h2>
        <p>
          Manage leverage and commission markups through the Admin Portal and
          MT5 Manager Portal. Keep trading platform backends, account groups and
          permissions under one roof.
        </p>
        <ul className="az-check-list">
          <li>
            <CheckCircle /> Leverage settings by account group
          </li>
          <li>
            <CheckCircle /> Commission and instrument markups
          </li>
          <li>
            <CheckCircle /> Centralized accounts, trades and platform backends
          </li>
          <li>
            <CheckCircle /> Permissions for owners, managers and members
          </li>
        </ul>
        <a className="az-text-link" href="#infrastructure">
          See the supplied MT5 administration views <ArrowUpRight size={18} />
        </a>
      </div>
      <div
        className="ab-admin-preview"
        aria-label="Illustrative community admin settings"
      >
        <div className="ab-preview-heading">
          <span>
            <SlidersHorizontal size={19} /> Community administration
          </span>
          <span className="az-preview-tag">EXAMPLE</span>
        </div>
        <BackendConnections />
        <div className="ab-admin-owner">
          <span className="az-avatar az-avatar-blue">AK</span>
          <div>
            <strong>Community head</strong>
            <small>Owner permissions</small>
          </div>
          <LockKey size={18} />
        </div>
        <div className="ab-admin-tabs">
          <span>Admin Portal</span>
          <span>MT5 Manager Portal</span>
        </div>
        <dl className="ab-admin-settings">
          <div>
            <dt>Account group</dt>
            <dd>Community / Gold Elite</dd>
          </div>
          <div>
            <dt>Leverage</dt>
            <dd>1:100</dd>
          </div>
          <div>
            <dt>Base commission</dt>
            <dd>
              $2.00 <small>/ lot</small>
            </dd>
          </div>
          <div>
            <dt>Extra commission markup</dt>
            <dd>
              $5.00 <small>/ lot</small>
            </dd>
          </div>
          <div>
            <dt>Total trader commission</dt>
            <dd>
              $7.00 <small>/ lot</small>
            </dd>
          </div>
          <div>
            <dt>Execution model</dt>
            <dd className="ab-a-book-value">A-book</dd>
          </div>
          <div>
            <dt>Liquidity routing</dt>
            <dd>External LP</dd>
          </div>
        </dl>
        <div className="ab-admin-bottom">
          <CheckCircle size={16} />
          <span>One view across your connected backends.</span>
        </div>
      </div>
    </section>
  );
}
