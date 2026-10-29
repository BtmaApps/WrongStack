import assert from 'node:assert/strict';

/** A real clipboard paste of source code offers a fence; wrap and undo change only that text. */
export async function exerciseNativePasteHint({ page }) {
  const composer = page.getByRole('textbox', { name: 'Message WrongStack', exact: true });
  const hint = page.locator('.composer-paste-hint');
  const original = await composer.inputValue();
  const code = 'def total(items):\n    return sum(items)\n';
  try {
    await composer.fill('Explain: ');
    await composer.focus();
    await composer.press('End');
    await page.evaluate((text) => navigator.clipboard.writeText(text), code);
    await page.keyboard.press('Control+v');
    await hint.getByText('Pasted text looks like python code.', { exact: true }).waitFor();
    assert.equal(await composer.inputValue(), `Explain: ${code}`, 'The paste itself is unchanged');
    await hint.getByRole('button', { name: 'Wrap in code block', exact: true }).click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('textarea[aria-label="Message WrongStack"]')?.value === expected,
      `Explain: \n\`\`\`python\n${code.trimEnd()}\n\`\`\`\n`,
    );
    await hint.getByRole('button', { name: 'Undo wrap', exact: true }).click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector('textarea[aria-label="Message WrongStack"]')?.value === expected,
      `Explain: ${code}`,
    );
    assert.equal(await hint.count(), 0, 'Undo closes the hint');
    // Prose is pasted without an offer.
    await composer.fill('');
    await page.evaluate(() =>
      navigator.clipboard.writeText('Please review.\nIt fails on empty input.'),
    );
    await page.keyboard.press('Control+v');
    await page.waitForFunction(
      () => document.querySelector('textarea[aria-label="Message WrongStack"]')?.value !== '',
    );
    assert.equal(await hint.count(), 0, 'Prose paste shows no code hint');
    console.log('PASS: native code paste hint: python detection, wrap, undo and no prose hint');
  } finally {
    await composer.fill(original);
  }
}
