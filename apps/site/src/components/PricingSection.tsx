import { useState } from 'react';
import { cn } from '@/lib/utils';

const PLANS = [
  {
    name: 'Community',
    description: 'Self-hosted, all features, forever free.',
    monthlyPrice: 0,
    annualPrice: 0,
    sessions: 'Unlimited',
    overage: null,
    daemons: 'Unlimited',
    seats: 'Unlimited',
    support: 'Community (GitHub)',
    sla: 'None',
    vmConfig: 'Your choice',
    features: [
      'Self-hosted (Docker Compose)',
      'All features included',
      'Unlimited sessions',
      'Unlimited daemons & seats',
      'Full governance controls',
      'BYOK for LLM costs',
    ],
    cta: 'Get Started',
    ctaHref: '/getting-started/install/',
    ctaStyle: 'outline' as const,
    highlight: false,
  },
  {
    name: 'Pro',
    description: 'Managed cloud for small teams.',
    monthlyPrice: 49,
    annualPrice: 39,
    sessions: '500/month',
    overage: '$0.08/session',
    daemons: '10',
    seats: '5',
    support: 'Email (48h response)',
    sla: '99.5% target*',
    vmConfig: '2 vCPU / 4 GB',
    features: [
      'Managed cloud hosting',
      '500 sessions included',
      '$0.08/session overage',
      'Up to 10 daemons',
      '5 team seats',
      'Email support',
      '99.5% SLA target*',
    ],
    cta: 'Contact Us',
    ctaHref: '#contact',
    ctaStyle: 'primary' as const,
    highlight: true,
  },
  {
    name: 'Enterprise',
    description: 'Managed cloud with SLA and priority support.',
    monthlyPrice: 299,
    annualPrice: 239,
    sessions: '5,000/month',
    overage: '$0.06/session',
    daemons: 'Unlimited',
    seats: 'Unlimited',
    support: 'Priority (4h) + Slack',
    sla: '99.9% target* + credits',
    vmConfig: 'Custom (up to 8 vCPU / 32 GB)',
    features: [
      'Managed cloud hosting',
      '5,000 sessions included',
      '$0.06/session overage',
      'Unlimited daemons & seats',
      'Priority support + Slack',
      '99.9% SLA target* + credits',
      'Custom VM configuration',
      'Data residency (US/EU)',
    ],
    cta: 'Contact Us',
    ctaHref: '#contact',
    ctaStyle: 'outline' as const,
    highlight: false,
  },
] as const;

function PricingToggle({
  isAnnual,
  onToggle,
}: {
  isAnnual: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 mb-12">
      <span
        className={cn(
          'text-sm font-medium transition-colors',
          !isAnnual ? 'text-zinc-50' : 'text-zinc-500'
        )}
      >
        Monthly
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isAnnual}
        aria-label="Toggle annual billing"
        onClick={onToggle}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          isAnnual ? 'bg-emerald-600' : 'bg-zinc-700'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
            isAnnual ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
      <span
        className={cn(
          'text-sm font-medium transition-colors',
          isAnnual ? 'text-zinc-50' : 'text-zinc-500'
        )}
      >
        Annual
      </span>
      {isAnnual && (
        <span className="ml-1 inline-flex items-center rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 text-[0.6875rem] font-medium text-emerald-400 uppercase tracking-wide">
          Save 20%
        </span>
      )}
    </div>
  );
}

function PricingCard({
  plan,
  isAnnual,
}: {
  plan: (typeof PLANS)[number];
  isAnnual: boolean;
}) {
  const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
  const isFree = price === 0;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border bg-zinc-900 p-6 transition-colors',
        plan.highlight
          ? 'border-emerald-400/50 ring-1 ring-emerald-400/20'
          : 'border-zinc-800 hover:border-zinc-700'
      )}
    >
      {plan.highlight && (
        <span className="inline-flex self-start items-center rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-0.5 text-[0.6875rem] font-medium text-emerald-400 uppercase tracking-wide mb-4">
          Most Popular
        </span>
      )}
      <h3 className="text-xl font-bold text-zinc-50 mb-1">{plan.name}</h3>
      <p className="text-sm text-zinc-500 mb-6">{plan.description}</p>

      <div className="mb-6">
        {isFree ? (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-zinc-50">Free</span>
            <span className="text-sm text-zinc-500">forever</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-zinc-50">
              ${price}
            </span>
            <span className="text-sm text-zinc-500">
              /mo{isAnnual ? ', billed annually' : ''}
            </span>
          </div>
        )}
      </div>

      <a
        href={plan.ctaHref}
        className={cn(
          'inline-flex items-center justify-center h-10 rounded-lg font-semibold text-[0.9375rem] px-6 transition-colors no-underline mb-6',
          plan.ctaStyle === 'primary'
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
            : 'border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-50'
        )}
      >
        {plan.cta}
      </a>

      <div className="border-t border-zinc-800 pt-6">
        <ul className="space-y-3">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-sm text-zinc-400"
            >
              <svg
                className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div>
      <PricingToggle
        isAnnual={isAnnual}
        onToggle={() => setIsAnnual((v) => !v)}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <PricingCard key={plan.name} plan={plan} isAnnual={isAnnual} />
        ))}
      </div>

      <div className="mt-8 space-y-2 text-[0.8125rem] text-zinc-600">
        <p>
          *SLA targets are best-effort until HA infrastructure is in place.
        </p>
        <p>
          Daemon and seat limits apply to managed tiers only. Self-hosted has no
          limits.
        </p>
        <p>All prices exclusive of applicable taxes.</p>
      </div>
    </div>
  );
}
