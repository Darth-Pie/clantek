/**
 * The public leadership tree — the org chart shown to any signed-in member. It
 * returns only the placed members who meet the rank threshold, so it's safe even
 * for members who can't see the full roster.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import OrgChartView, { type ChartMember } from '../components/OrgChartView';
import { sanitizeOrgChart, EMPTY_ORG_CHART, type OrgChart } from '../../shared/orgchart';

export default function Leadership() {
  const { can } = useSession();
  const [data, setData] = useState<{ chart: OrgChart; members: ChartMember[] } | null>(null);

  useEffect(() => {
    api
      .get<{ chart: OrgChart; members: ChartMember[] }>('/orgchart')
      .then((d) => setData({ chart: sanitizeOrgChart(d.chart), members: d.members }))
      .catch(() => setData({ chart: EMPTY_ORG_CHART, members: [] }));
  }, []);

  if (!data) return <div className="loading">Loading…</div>;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Leadership</h2>
      </header>
      {/* Only link boxes to profiles for viewers who can open them (roster.view). */}
      <OrgChartView chart={data.chart} members={data.members} linkMembers={can('roster.view')} />
    </section>
  );
}
