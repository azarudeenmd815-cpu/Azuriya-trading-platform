import Image from "next/image";
import {
  ArrowUpRight,
  PlugsConnected,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

export function HeroGraphic() {
  return (
    <div className="hg-scene">
      <div className="hg-art">
        <Image
          src="/marketing/graphics/brokerage-network.png"
          alt="Isometric illustration of a brokerage portal linking trading accounts, community tools and external liquidity"
          fill
          sizes="(max-width: 767px) 94vw, (max-width: 1023px) 48vw, 610px"
          preload
          data-hero-illustration
        />
      </div>
      <div className="hg-liquidity-card">
        <span className="hg-card-icon">
          <PlugsConnected size={20} />
        </span>
        <span>
          <small>WHITE-LABEL INFRASTRUCTURE</small>
          <strong>
            Your brand. Your business. <ArrowUpRight size={15} />
          </strong>
        </span>
      </div>
      <div className="hg-platform-card">
        <div className="hg-platform-logos" aria-hidden="true">
          <Image
            src="/marketing/platforms/metatrader-5.png"
            alt=""
            width={25}
            height={25}
          />
          <Image
            src="/marketing/platforms/ctrader.ico"
            alt=""
            width={25}
            height={25}
            unoptimized
          />
          <Image
            src="/marketing/platforms/tradelocker.webp"
            alt=""
            width={25}
            height={25}
          />
        </div>
        <span>
          <strong>Your platforms. Connected.</strong>
          <small>Accounts · trades · copy settings</small>
        </span>
      </div>
      <div className="hg-community-card">
        <UsersThree size={17} />
        <span>Your entire team. One portal.</span>
      </div>
    </div>
  );
}
