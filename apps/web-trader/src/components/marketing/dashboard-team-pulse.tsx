"use client";

import { useId } from "react";
import {
  ArrowRight,
  CalendarBlank,
  ChatCircleText,
  Hash,
  Headphones,
  UsersThree,
} from "@phosphor-icons/react";
import "./dashboard-team-pulse.css";

const engagement = [
  { day: "Mon", text: 28, voice: 12 },
  { day: "Tue", text: 34, voice: 16 },
  { day: "Wed", text: 31, voice: 14 },
  { day: "Thu", text: 42, voice: 18 },
  { day: "Fri", text: 38, voice: 16 },
  { day: "Sat", text: 24, voice: 8 },
  { day: "Sun", text: 20, voice: 6 },
];

function EngagementChart() {
  const chartId = useId();
  const radius = 3.4;
  return (
    <figure className="dtp-engagement">
      <figcaption>
        <strong>Weekly member engagement</strong>
        <span>Example activity</span>
      </figcaption>
      <svg
        viewBox="0 0 448 118"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby={`${chartId}-title ${chartId}-description`}
      >
        <title id={`${chartId}-title`}>Example text and voice activity</title>
        <desc id={`${chartId}-description`}>
          Members participating in text and voice channels from Monday to
          Sunday. Each full dot represents two participants; a half dot
          represents one. Blue dots show voice participation, stacked below text
          participation. Monday: 28 text and 12 voice. Tuesday: 34 text and 16
          voice. Wednesday: 31 text and 14 voice. Thursday: 42 text and 18
          voice. Friday: 38 text and 16 voice. Saturday: 24 text and 8 voice.
          Sunday: 20 text and 6 voice. The categories may include the same
          members and do not represent unique combined totals. These are
          simulated sample values.
        </desc>
        {[26, 68, 110].map((y) => (
          <line
            key={y}
            x1="8"
            x2="440"
            y1={y}
            y2={y}
            className="dtp-gridline"
          />
        ))}
        {engagement.map(({ day, text, voice }, index) => {
          const center = 32 + index * 64;
          const voiceDots = voice / 2;
          const textDots = text / 2;
          const dots = voiceDots + Math.ceil(textDots);
          return (
            <g
              key={day}
              data-weekday={day}
              data-text-participants={text}
              data-voice-participants={voice}
            >
              <title>
                {`${day}: ${text} text participants and ${voice} voice participants`}
              </title>
              {Array.from({ length: dots }, (_, dot) => {
                const x = center + ((dot % 4) - 1.5) * 10;
                const y = 110 - Math.floor(dot / 4) * 14;
                const isVoice = dot < voiceDots;
                const isHalf = !isVoice && dot === dots - 1 && text % 2 !== 0;
                const halfId = `${chartId}-${day}-half`;
                return (
                  <g
                    key={dot}
                    data-dot-value={isHalf ? "1" : "2"}
                    data-participation={isVoice ? "voice" : "text"}
                  >
                    {isHalf && (
                      <>
                        <defs>
                          <clipPath id={halfId}>
                            <rect
                              x={x - radius}
                              y={y - radius}
                              width={radius}
                              height={radius * 2}
                            />
                          </clipPath>
                        </defs>
                        <circle
                          cx={x}
                          cy={y}
                          r={radius}
                          className="dtp-dot-outline"
                        />
                      </>
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={radius}
                      className={isVoice ? "dtp-voice-dot" : "dtp-text-dot"}
                      clipPath={isHalf ? `url(#${halfId})` : undefined}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="dtp-weekdays" aria-hidden="true">
        {engagement.map(({ day }) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="dtp-legend" aria-hidden="true">
        <span>
          <i className="dtp-text-key" /> Text channels
        </span>
        <span>
          <i className="dtp-voice-key" /> Voice rooms
        </span>
      </div>
      <p className="dtp-dot-scale">
        1 dot = 2 participants · Half dot = 1 participant
      </p>
    </figure>
  );
}

export function DashboardTeamPulse({
  onView,
}: {
  onView: (view: "Community" | "Teams") => void;
}) {
  return (
    <section className="dtp-pulse" aria-labelledby="dtp-pulse-title">
      <header className="dtp-header">
        <div>
          <h3 id="dtp-pulse-title">Your team, in sync</h3>
          <p>Conversations, voice rooms and member activity.</p>
        </div>
        <span className="dtp-demo-label">Simulated workspace</span>
      </header>
      <div className="dtp-body">
        <div className="dtp-activity">
          <EngagementChart />
          <div
            className="dtp-channel-strip"
            aria-label="Example active channels"
          >
            <span>
              <Hash size={17} aria-hidden="true" />
              <b>market-discussion</b>
              <small>24 messages</small>
            </span>
            <span>
              <Headphones size={17} aria-hidden="true" />
              <b>London session</b>
              <small>8 in room</small>
            </span>
          </div>
        </div>
        <div className="dtp-team">
          <div className="dtp-presence">
            <div
              className="dtp-avatars"
              aria-label="Example members Alex, Sara, Marcus and Nina"
            >
              <span>AM</span>
              <span>SC</span>
              <span>MR</span>
              <span>NP</span>
            </div>
            <div>
              <strong>5 members online</strong>
              <span className="dtp-presence-caption">
                Gold Elite · FX Intraday
              </span>
            </div>
          </div>
          <div className="dtp-event">
            <span className="dtp-event-icon">
              <CalendarBlank size={21} aria-hidden="true" />
            </span>
            <div>
              <strong>London session briefing</strong>
              <time dateTime="2026-10-01T16:00:00Z">01 Oct · 16:00 UTC</time>
              <small>Example schedule · Voice room</small>
            </div>
          </div>
          <div className="dtp-actions">
            <button type="button" onClick={() => onView("Community")}>
              <ChatCircleText size={19} aria-hidden="true" />
              <span>
                <b>Open Community</b>
                <small>Chat, threads, rooms & events</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onView("Teams")}>
              <UsersThree size={19} aria-hidden="true" />
              <span>
                <b>Manage Teams</b>
                <small>Members, groups & permissions</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
