import { Link } from 'react-router-dom';
import { t, useLanguage } from '../../i18n/language';
import { useActiveCampaigns } from '../../api/hooks';
import { offerAmount, offerLink, offerScope, pickFeaturedCampaign } from '../../lib/campaignFacts';
import { countdown, useNow } from '../../lib/countdown';
import { Icon } from '../Icon';

/**
 * The full-width sale band: the one campaign the store chose to feature (or the biggest live
 * one), with its real amount, scope, countdown and a link to where it can be spent.
 */
export function HomeCampaignBanner() {
  useLanguage();
  const { data, isLoading } = useActiveCampaigns();
  const campaigns = (data ?? []).filter((campaign) => campaign.isActive);
  const featured = pickFeaturedCampaign(campaigns);
  const now = useNow(featured?.expiresAt ? 1000 : 60000);

  if (isLoading || !featured) return null;

  const left = featured.expiresAt ? countdown(featured.expiresAt, now) : null;
  // The store's own campaign title leads; without one, the amount carries the band.
  const headline = featured.campaignTitle?.trim()
    ? featured.campaignTitle
    : `${t("Up to")} ${offerAmount(featured)}`;

  return (
    <section className="home-campaign-banner" aria-labelledby="home-campaign-banner-heading">
      <div className="home-campaign-banner__inner">
        <span className="home-campaign-banner__kicker">{t("Campaign of the moment")}</span>
        <div className="home-campaign-banner__headline">
          <strong id="home-campaign-banner-heading" className="home-campaign-banner__amount">
            {headline}
          </strong>
          <span className="home-campaign-banner__scope">{offerScope(featured)}</span>
        </div>
        {left ? (
          <span className="home-campaign-banner__countdown">
            <Icon name="clock" width={15} height={15} />
            {t("Ends in")} {left}
          </span>
        ) : (
          <span className="home-campaign-banner__always">
            <Icon name="check" width={15} height={15} />
            {t("Running now")}
          </span>
        )}
        <Link className="btn btn--primary home-campaign-banner__cta" to={offerLink(featured)}>
          {t("Shop the sale")} <span aria-hidden="true">{t("↗")}</span>
        </Link>
      </div>
    </section>
  );
}
