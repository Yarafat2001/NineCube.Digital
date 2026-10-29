import { t, useLanguage } from '../i18n/language';
﻿import type { SalesSummary } from '../api/types';
import { formatMoney } from '../lib/helpers';

/** Charts use only the currently selected report; no inferred daily totals. */
export function SalesCharts({ data }: { data: SalesSummary }) {
  useLanguage();
  const total = data.byStatus.reduce((sum, row) => sum + row.orderCount, 0);
  const maxRevenue = Math.max(0, ...data.byStatus.map(row => row.revenue));
  let offset = 0;
  return <div className="sales-charts">
    <section className="card-glass sales-chart" aria-labelledby="sales-distribution-title">
      <h2 id="sales-distribution-title">{t("Orders by status")}</h2>
      <p className="muted">{t("Order distribution in the selected date range.")}</p>
      <div className="sales-distribution">
        <svg className="sales-donut" viewBox="0 0 200 200" role="img" aria-label={t(total ? data.byStatus.map(row => `${row.status}: ${row.orderCount} orders`).join(', ') : 'No orders in this date range')}>
          <circle className="sales-donut__base" cx="100" cy="100" r="76" fill="none" strokeWidth="20" />
          {data.byStatus.filter(row => row.orderCount > 0).map(row => {
            const share = row.orderCount / total * 100;
            const start = offset; offset += share;
            return <circle key={row.status} data-status={row.status} className="sales-donut__segment" cx="100" cy="100" r="76" pathLength="100" fill="none" strokeWidth="20" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 100 100)"><title>{t(row.status)}{t(": ")}{t(row.orderCount)} {t(" orders")}</title></circle>;
          })}
          <text x="100" y="100" textAnchor="middle" className="sales-donut__total">{t(total)}</text>
          <text x="100" y="122" textAnchor="middle" className="sales-donut__label">{t("orders")}</text>
        </svg>
        <ul className="sales-legend" aria-label={t("Order distribution values")}>
          {data.byStatus.map(row => <li key={row.status} data-status={row.status}><span className="sales-legend__name"><span className="sales-legend__dot" aria-hidden="true" />{t(row.status)}</span><strong>{t(row.orderCount)}</strong><span className="muted">{t(total ? (row.orderCount / total * 100).toFixed(1) : '0.0')}{t("%")}</span></li>)}
        </ul>
      </div>
      {!total && <p className="muted">{t("No orders in this date range. Choose another range to see the distribution.")}</p>}
    </section>
    <section className="card-glass sales-chart" aria-labelledby="sales-revenue-title">
      <h2 id="sales-revenue-title">{t("Revenue by status")}</h2>
      <p className="muted">{t(data.currency ?? 'BDT')} {t(" revenue from standing orders. Cancelled and rejected orders contribute zero.")}</p>
      <ul className="sales-revenue" aria-label={t("Revenue by status values")}>
        {data.byStatus.map(row => <li key={row.status} data-status={row.status}>
          <div className="sales-revenue__label"><span>{t(row.status)}</span><strong>{t(formatMoney(row.revenue, data.currency))}</strong></div>
          <div className="sales-revenue__track" aria-hidden="true"><span style={{ width: `${maxRevenue > 0 ? row.revenue / maxRevenue * 100 : 0}%` }} /></div>
        </li>)}
      </ul>
      {!maxRevenue && <p className="muted">{t("No revenue for the selected range and currency.")}</p>}
    </section>
  </div>;
}
