import { test, expect } from '@playwright/test';

/**
 * Motion remains available by default, but an OS-level reduced-motion
 * preference must make every existing animation and transition effectively
 * immediate. This probes the generated global CSS rather than a particular
 * feature so new components inherit the same guarantee.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('reduced-motion preference makes shared motion immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');

  const motion = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'animate-spin transition-transform duration-500';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = {
      animationDuration: style.animationDuration,
      animationIterationCount: style.animationIterationCount,
      transitionDuration: style.transitionDuration,
    };
    probe.remove();
    return result;
  });

  expect(['0.01ms', '1e-05s']).toContain(motion.animationDuration);
  expect(motion.animationIterationCount).toBe('1');
  expect(['0.01ms', '1e-05s']).toContain(motion.transitionDuration);
});
