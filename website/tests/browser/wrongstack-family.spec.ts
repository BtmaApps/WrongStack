import { expect, test } from '@playwright/test';

test('the family is discoverable and links to the official sibling projects', async ({
  page,
}, testInfo) => {
  const expected = [
    ['WrongStack', 'https://github.com/WrongStack/WrongStack'],
    ['WrongForge', 'https://github.com/WrongStack/WrongForge'],
    ['WrongTrace', 'https://github.com/WrongStack/WrongTrace'],
  ];
  for (const route of ['/', '/ecosystem']) {
    await page.goto(route);
    const family = page.getByRole('region', { name: 'WrongStack family', exact: true });
    await expect(family).toBeVisible();
    await expect(family.getByRole('article')).toHaveCount(3);
    for (const [name, href] of expected) {
      await expect(family.getByRole('heading', { name, exact: true })).toBeVisible();
      const link = family.getByRole('link', { name: `Explore ${name} on GitHub`, exact: true });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(
        family.getByRole('link', { name: `Read ${name} documentation` }),
      ).toHaveAttribute('href', /^https:\/\/github\.com\/WrongStack\//);
    }
    await expect(family.getByRole('link', { name: 'WrongTrace license: BUSL-1.1' })).toBeVisible();
    await expect(
      family
        .getByRole('article')
        .filter({ hasText: 'WrongForge' })
        .getByText('Experimental', { exact: true }),
    ).toBeVisible();
    const footer = page.getByRole('region', { name: 'WrongStack family navigation' });
    for (const [name, href] of expected) {
      await expect(footer.getByRole('link', { name: new RegExp(name) })).toHaveAttribute(
        'href',
        href,
      );
    }
    const geometry = await family.evaluate((element) => ({
      scroll: element.scrollWidth,
      width: element.clientWidth,
      cards: [...element.querySelectorAll('article')].map((card) => ({
        scroll: card.scrollWidth,
        width: card.clientWidth,
      })),
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    for (const card of geometry.cards) expect(card.scroll).toBeLessThanOrEqual(card.width + 1);
    if (route === '/')
      await family.screenshot({ path: testInfo.outputPath('wrongstack-family.png') });
  }
  await page.getByRole('button', { name: 'Search pages, features and commands' }).click();
  const search = page.getByRole('dialog', { name: 'Search WrongStack documentation' });
  for (const query of ['WrongForge', 'WrongTrace']) {
    await search.getByRole('textbox').fill(query);
    await expect(search.getByRole('option').filter({ hasText: 'Ecosystem' })).toBeVisible();
  }
  await search.getByRole('option').filter({ hasText: 'Ecosystem' }).click();
  await expect(search).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'WrongStack family', exact: true })).toBeVisible();
});
