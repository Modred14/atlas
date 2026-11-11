// src/server/analytics.js
import { one, rows } from "./db.js";
import { getSetting } from "./settings.js";

// Every number comes from rows in the database. Nothing is estimated or seeded.
export async function getAnalytics({ days = 30 } = {}) {
  const tz = (await getSetting("safety")).sendWindow.timezone;
  const span = Math.min(Math.max(Number(days) || 30, 1), 365);

  const totals = await one(
    `select
       (select count(*) from companies) as companies,
       (select count(distinct company_id) from contacts where verification = 'verified') as verified_companies,
       (select count(*) from contacts where verification = 'verified') as verified_contacts,
       (select count(*) from outreach where kind in ('outreach','followup')) as generated,
       (select count(*) from outreach where status in ('sent','bounced')) as sent,
       (select count(*) from outreach where status = 'sent') as delivered,
       (select count(*) from outreach where status = 'bounced') as bounced,
       (select count(*) from outreach where status = 'failed') as failed,
       (select count(distinct company_id) from inbox_messages where category not in ('bounce','auto_reply','opt_out') and company_id is not null) as replies,
       (select count(*) from inbox_messages where category in ('interested','interview')) as positive,
       (select count(*) from inbox_messages where category = 'interview') as interviews,
       (select count(*) from inbox_messages where category = 'rejection') as rejections,
       (select count(*) from suppression) as suppressed`,
  );
  const outreachSent = await one("select count(distinct company_id) as n from outreach where status in ('sent','bounced') and kind in ('outreach','followup') and company_id is not null");

  const daily = await rows(
    `select to_char(d::date, 'YYYY-MM-DD') as day,
       coalesce((select count(*) from outreach o where o.status in ('sent','bounced') and (o.sent_at at time zone $2)::date = d::date), 0) as sent,
       coalesce((select count(*) from inbox_messages m where m.category not in ('bounce','auto_reply') and m.company_id is not null and (m.received_at at time zone $2)::date = d::date), 0) as replies,
       coalesce((select count(*) from companies c where (c.discovered_at at time zone $2)::date = d::date), 0) as discovered
     from generate_series(((now() at time zone $2)::date - ($1::int - 1)), (now() at time zone $2)::date, interval '1 day') d
     order by d`,
    [span, tz],
  );

  const campaigns = await rows(
    `select c.id, c.name, c.status,
       count(o.*) filter (where o.status in ('sent','bounced')) as sent,
       count(o.*) filter (where o.status = 'bounced') as bounced,
       (select count(distinct m.company_id) from inbox_messages m join outreach x on x.id = m.outreach_id
          where x.campaign_id = c.id and m.category not in ('bounce','auto_reply')) as replies
     from campaigns c left join outreach o on o.campaign_id = c.id group by c.id order by c.id desc`,
  );

  const categories = await rows("select category, count(*) as n from inbox_messages group by category order by n desc");

  return {
    totals: {
      ...totals,
      responseRate: outreachSent.n > 0 ? Math.round((totals.replies / outreachSent.n) * 1000) / 10 : null,
    },
    daily, campaigns, categories, days: span, timezone: tz,
  };
}
