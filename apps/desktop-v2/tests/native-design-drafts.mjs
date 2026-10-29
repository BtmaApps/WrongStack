import assert from 'node:assert/strict';

/**
 * Unsaved Design Studio edits come back after a renderer reload for the same
 * active kit, and edits saved for another kit are reported but never applied.
 */
export async function exerciseNativeDesignDrafts({ page, project, open, kitId }) {
  const place = { projectId: project.id, formKey: 'design-edits' };
  const ipc = (method, params) =>
    page.evaluate(
      ({ method, params }) => window.__TAURI_INTERNALS__.invoke('host_request', { method, params }),
      { method, params },
    );
  const stored = () => ipc('form-draft.get', place);
  const until = async (check, label) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await check();
      if (value) return value;
      await page.waitForTimeout(100);
    }
    throw Error(`Timed out: ${label}`);
  };
  const screen = page.getByRole('region', { name: 'Project Design Studio', exact: true });
  const primary = screen.getByRole('textbox', { name: 'Design light primary', exact: true });
  await primary.fill('#224466');
  const saved = await until(async () => {
    const draft = await stored();
    return draft.value?.colors?.['light.primary'] === '#224466' ? draft : null;
  }, 'Design edits acknowledged in native storage');
  assert.equal(saved.value.kit, kitId);

  await page.reload();
  await open(project);
  await screen.getByRole('status').filter({ hasText: 'Restored unsaved design edits' }).waitFor();
  assert.equal(await primary.inputValue(), '#224466');
  await screen.getByRole('button', { name: 'Discard color edits', exact: true }).click();
  await until(async () => (await stored()).value === null, 'Discarded design edits cleared');

  // Edits recorded for a kit that is no longer active are never applied to this one.
  const current = await stored();
  await ipc('form-draft.save', {
    ...place,
    value: { ...saved.value, kit: 'retired-kit' },
    expectedRevision: current.revision,
  });
  await page.reload();
  await open(project);
  const stale = screen.getByRole('region', { name: 'Earlier design edits', exact: true });
  await stale.waitFor();
  assert.notEqual(await primary.inputValue(), '#224466', 'Another kit’s edits stay unapplied');
  await stale.getByRole('button', { name: 'Discard earlier edits', exact: true }).click();
  await until(async () => (await stored()).value === null, 'Earlier kit edits discarded');
  console.log(
    'PASS: native design edit drafts: reload restore for the active kit, explicit discard and other-kit refusal',
  );
}
