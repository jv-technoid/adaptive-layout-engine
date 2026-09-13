import type { AdElement, AdSpec } from './types';

/**
 * Defines an ad spec. This is intentionally a thin identity function — its
 * job is to give call sites a readable declaration point, and a single
 * place to extend (validation, defaults) later without touching every
 * spec that uses it.
 */
export function defineAd(spec: { id: string; name: string; elements: AdElement[] }): AdSpec {
  return spec;
}

/**
 * The one ad spec used throughout the app. Notice there is nothing here
 * that mentions a surface, a pixel coordinate, or a device — that is the
 * whole point. The same spec is resolved onto every surface profile.
 */
export const novaAdSpec: AdSpec = defineAd({
  id: 'nova-x1-launch',
  name: 'Nova X1 Launch',
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      label: 'Headline',
      content: 'Meet Nova X1',
    },
    {
      id: 'product-image',
      type: 'image',
      role: 'hero',
      priority: 1,
      label: 'Hero',
    },
    {
      id: 'price',
      type: 'text',
      role: 'secondary',
      priority: 2,
      label: 'Price',
      content: 'From ₹49,999',
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      label: 'CTA',
      content: 'Buy now',
    },
    {
      id: 'logo',
      type: 'image',
      role: 'branding',
      priority: 3,
      label: 'Branding',
    },
  ],
});
