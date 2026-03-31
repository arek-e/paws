import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PricingSection from './PricingSection';

describe('PricingSection', () => {
  test('defaults to monthly pricing, shows $49 and $299', () => {
    render(<PricingSection />);

    expect(screen.getByText('$49')).toBeDefined();
    expect(screen.getByText('$299')).toBeDefined();
    expect(screen.getByText('Free')).toBeDefined();
  });

  test('toggle to annual shows $39 and $239 with Save 20% badge', () => {
    render(<PricingSection />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(screen.getByText('$39')).toBeDefined();
    expect(screen.getByText('$239')).toBeDefined();
    expect(screen.getByText('Save 20%')).toBeDefined();
    expect(screen.getByText('Free')).toBeDefined();
  });

  test('toggle back to monthly reverts prices', () => {
    render(<PricingSection />);

    const toggle = screen.getByRole('switch');

    // Toggle to annual
    fireEvent.click(toggle);
    expect(screen.getByText('$39')).toBeDefined();

    // Toggle back to monthly
    fireEvent.click(toggle);
    expect(screen.getByText('$49')).toBeDefined();
    expect(screen.getByText('$299')).toBeDefined();
    expect(screen.queryByText('Save 20%')).toBeNull();
  });

  test('renders all three plan names', () => {
    render(<PricingSection />);

    expect(screen.getByText('Community')).toBeDefined();
    expect(screen.getByText('Pro')).toBeDefined();
    expect(screen.getByText('Enterprise')).toBeDefined();
  });

  test('Community plan shows Get Started CTA', () => {
    render(<PricingSection />);

    expect(screen.getByText('Get Started')).toBeDefined();
  });

  test('Pro and Enterprise show Contact Us CTAs', () => {
    render(<PricingSection />);

    const contactButtons = screen.getAllByText('Contact Us');
    expect(contactButtons).toHaveLength(2);
  });
});
