import { Compass, FlaskConical, LayoutDashboard, ScanLine, Scale, Settings, Users } from 'lucide-react';

const rulesLink = { pillar: 'rules', section: 'sec-proprules', icon: Scale } as const;

export const mobileWorkspaceLinks = [
  { pillar: 'desk', section: 'sec-accounts', icon: LayoutDashboard },
  { pillar: 'plan', section: 'tv-chart-root', icon: Compass },
  { pillar: 'quant', section: 'sec-quant-risk', icon: FlaskConical },
  { pillar: 'review', section: 'sec-review-autopsy', icon: ScanLine },
] as const;

export const primaryWorkspaceLinks = [...mobileWorkspaceLinks, rulesLink] as const;

export const secondaryWorkspaceLinks = [
  { pillar: 'mall', section: 'sec-mall', icon: Users },
  { pillar: 'settings', section: 'sec-settings', icon: Settings },
] as const;

export type WorkspacePillar =
  | (typeof primaryWorkspaceLinks)[number]['pillar']
  | (typeof secondaryWorkspaceLinks)[number]['pillar'];

export const mobileMoreLinks = [
  rulesLink,
  ...secondaryWorkspaceLinks,
] as const;
