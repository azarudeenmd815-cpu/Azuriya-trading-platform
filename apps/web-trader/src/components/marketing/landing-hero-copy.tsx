"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, PlayCircle } from "@phosphor-icons/react";
import { useSiteLanguage } from "@/lib/site-language-client";
import { localizedUi } from "@/lib/site-language";

export function LandingHeroCopy() {
  const copy = localizedUi[useSiteLanguage()];
  return (
    <div className="ab-hero-editorial">
      <div className="az-hero-eyebrow">
        <span className="az-eyebrow-line" />
        {copy.eyebrow}
      </div>
      <h1 id="hero-title">
        {copy.headingOne} <br />
        {copy.headingTwo}
      </h1>
      <p className="az-hero-tagline">{copy.headingThree}</p>
      <div className="az-hero-copy">
        <p>{copy.heroDescription}</p>
        <div className="az-hero-actions">
          <Link href="/brokerage" className="az-button">
            {copy.explorePortal} <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/prop-firm" className="az-explore">
            <PlayCircle size={19} aria-hidden="true" />
            {copy.seeCompleteSolution}
          </Link>
        </div>
        <Link href="/mt5-deposits" className="mdh-hero-link">
          <Image
            src="/marketing/platforms/metatrader-5.png"
            alt=""
            width={19}
            height={19}
          />
          {copy.mt5Deposit}
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <a href="#platform" className="az-text-link">
        Explore the Platform <ArrowUpRight size={16} />
      </a>
    </div>
  );
}
