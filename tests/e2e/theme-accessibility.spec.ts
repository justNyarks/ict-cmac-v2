import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const themes = ['light', 'dark'] as const

for (const theme of themes) {
  test(`${theme} sign-in theme remains accessible`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem('ict-cmac-theme', selectedTheme)
    }, theme)
    await page.goto('/auth/signin')
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)
    await expect(page.getByRole('heading', { name: /login/i })).toBeVisible()
    await expect(page.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` })).toBeVisible()

    const accessibilityScan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    expect(accessibilityScan.violations).toEqual([])
    await expect(page).toHaveScreenshot(`sign-in-${theme}.png`, {
      animations: 'disabled',
      fullPage: true,
    })
  })
}

test('theme control is keyboard accessible', async ({ page }) => {
  await page.goto('/auth/signin')
  const themeToggle = page.getByRole('button', { name: /switch to .* mode/i })

  await themeToggle.focus()
  await expect(themeToggle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass(/dark/)
})
