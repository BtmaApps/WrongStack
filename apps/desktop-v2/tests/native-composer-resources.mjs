import assert from 'node:assert/strict';
import { join } from 'node:path';

/** Project-owned catalogs and session-owned context, exercised through the actual native UI. */
export async function exerciseNativeComposerResources({
  page,
  project,
  otherProject,
  identity,
  agent,
  rpc,
  engineRpc,
  artifactDir,
  waitFor,
  providerFixture,
}) {
  assert.ok(
    identity.protocolCapabilities?.includes('session.user-ack'),
    'The bundled engine advertises acknowledged direct human submissions',
  );
  const offsets = new Map();
  const call = async (scope, type, payload = {}, replies = [type], projectId = project.id) => {
    const key = scope === 'project' ? projectId : agent.id;
    const requestId = crypto.randomUUID();
    const params = scope === 'project' ? { projectId } : { id: agent.id };
    await (scope === 'project' ? rpc : engineRpc)(`${scope}.send`, {
      ...params,
      message: { type, payload: { ...payload, requestId } },
    });
    return await waitFor(
      async () => {
        const batch = await (scope === 'project' ? rpc : engineRpc)(`${scope}.events`, {
          ...params,
          offset: offsets.get(key) ?? 0,
        });
        offsets.set(key, batch.offset);
        const event = batch.events.find(
          (item) =>
            item.payload?.requestId === requestId &&
            (replies.includes(item.type) || item.type === 'error'),
        );
        if (
          event?.type === 'error' ||
          event?.payload?.success === false ||
          typeof event?.payload?.error === 'string'
        )
          throw Error(event.payload.error ?? event.payload.message);
        return event?.payload;
      },
      `Native resource ${scope} ${type}`,
      45000,
    );
  };
  const input = () => page.getByRole('textbox', { name: 'Message WrongStack', exact: true });
  const idle = () =>
    waitFor(
      async () => !(await page.getByRole('button', { name: 'Stop run', exact: true }).count()),
      'Resource conversation settles',
      60000,
    );
  const menu = async () => {
    const details = page.locator('.composer-options');
    if (!(await details.evaluate((el) => el.open)))
      await details.getByLabel('Composer options', { exact: true }).click();
    return details;
  };
  const library = async () => {
    await (await menu()).getByRole('button', { name: 'Prompt library', exact: true }).click();
    return page.getByRole('dialog', { name: 'Prompt library', exact: true });
  };
  await idle();
  let dialog = await library();
  await dialog
    .getByRole('button', { name: 'New template', exact: true })
    .waitFor({ timeout: 100000 });
  const sessionCount = (await engineRpc('snapshot')).sessions.length;
  await dialog.getByRole('button', { name: 'New template', exact: true }).click();
  await dialog
    .getByRole('textbox', { name: 'Template title', exact: true })
    .fill('Native reusable composer request');
  await dialog
    .getByRole('textbox', { name: 'Template description', exact: true })
    .fill('A scoped, reusable review request.');
  await dialog
    .getByRole('textbox', { name: 'Template category', exact: true })
    .fill('native-review');
  await dialog
    .getByRole('textbox', { name: 'Template instructions', exact: true })
    .fill('Review {{target}} and preserve its public API.');
  await dialog
    .getByRole('group', { name: 'Required variables', exact: true })
    .getByRole('checkbox', { name: 'target', exact: true })
    .check();
  await dialog.getByRole('button', { name: 'Close prompt workspace', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep editing template', exact: true }).click();
  assert.equal(
    await dialog.getByRole('textbox', { name: 'Template title', exact: true }).inputValue(),
    'Native reusable composer request',
    'Canceling close preserves template draft',
  );
  await dialog.getByRole('button', { name: 'Save template', exact: true }).click();
  const details = dialog.getByRole('region', { name: 'Prompt template details', exact: true });
  await details
    .getByRole('heading', { name: 'Native reusable composer request', exact: true })
    .waitFor();
  assert.equal(
    await details.getByRole('button', { name: 'Insert into draft', exact: true }).isEnabled(),
    false,
  );
  await details
    .getByRole('textbox', { name: 'Prompt variable target', exact: true })
    .fill('src/main.ts');
  await details.getByRole('button', { name: 'Favorite', exact: true }).click();
  await details.getByRole('button', { name: 'Unfavorite', exact: true }).waitFor();
  const saved = await call('project', 'prompts.content', {
    slug: 'native-reusable-composer-request',
  });
  assert.equal(saved.content, 'Review {{target}} and preserve its public API.');
  assert.equal(saved.source, 'user');
  assert.equal(saved.variables[0].required, true);
  await page.screenshot({ path: join(artifactDir, 'native-prompt-library.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Close prompt workspace', exact: true }).click();
  await input().fill('Keep my existing instruction.');
  dialog = await library();
  await dialog
    .getByRole('textbox', { name: 'Search prompt library', exact: true })
    .fill('Native reusable composer request');
  await dialog
    .getByRole('region', { name: 'Prompt templates', exact: true })
    .getByRole('button')
    .filter({ hasText: 'Native reusable composer request' })
    .click();
  await dialog
    .getByRole('textbox', { name: 'Prompt variable target', exact: true })
    .fill('src/main.ts');
  await dialog.getByRole('button', { name: 'Insert into draft', exact: true }).click();
  assert.equal(
    await input().inputValue(),
    'Keep my existing instruction.\n\nReview src/main.ts and preserve its public API.',
    'Template insertion appends rather than replacing the draft',
  );
  dialog = await library();
  await dialog
    .getByRole('combobox', { name: 'Prompt library filter', exact: true })
    .selectOption('recent');
  await dialog
    .getByRole('region', { name: 'Prompt templates', exact: true })
    .getByRole('button')
    .filter({ hasText: 'Native reusable composer request' })
    .waitFor();
  await dialog
    .getByRole('combobox', { name: 'Prompt library filter', exact: true })
    .selectOption('favorites');
  await dialog
    .getByRole('region', { name: 'Prompt templates', exact: true })
    .getByRole('button')
    .filter({ hasText: 'Native reusable composer request' })
    .waitFor();
  await dialog.getByRole('button', { name: 'Close prompt workspace', exact: true }).click();

  const skills = (await call('project', 'skills.list')).skills;
  assert.ok(skills.length > 0, 'Actual skill catalog is available');
  const skillName = skills[0].name;
  const callsBeforePick = providerFixture.calls.filter((call) => call.stream === true).length;
  await input().fill('$' + skillName);
  await page
    .getByRole('region', { name: 'Skill suggestions', exact: true })
    .getByRole('option')
    .first()
    .waitFor();
  await input().press('Tab');
  assert.equal(await input().inputValue(), '$' + skillName + ' ');
  assert.equal(
    await input().evaluate((el) => el.selectionStart),
    skillName.length + 2,
    'Skill insertion restores the caret synchronously',
  );
  assert.equal(
    providerFixture.calls.filter((call) => call.stream === true).length,
    callsBeforePick,
    'Picking a skill does not start a provider turn',
  );
  await input().fill('Inspect @README');
  await page
    .getByRole('region', { name: 'Project file suggestions', exact: true })
    .getByRole('option')
    .filter({ hasText: 'README.md' })
    .first()
    .waitFor();
  await input().press('Enter');
  await page
    .getByRole('region', { name: 'Attached project files', exact: true })
    .getByRole('button', { name: 'Remove file reference README.md', exact: true })
    .waitFor();
  assert.equal(
    providerFixture.calls.filter((call) => call.stream === true).length,
    callsBeforePick,
    'Picking a file does not start a provider turn',
  );
  await page.locator('.session-tab-label').filter({ hasText: 'Native UI terminal' }).click();
  await page.locator('.session-tab-label').filter({ hasText: 'WrongStack engine proof' }).click();
  await page
    .getByRole('region', { name: 'Attached project files', exact: true })
    .getByRole('button', { name: 'Remove file reference README.md', exact: true })
    .waitFor();
  assert.equal(await input().inputValue(), 'Inspect ');
  await input().fill('[native-composer-resource] Inspect the referenced project file.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await waitFor(
    () =>
      providerFixture.calls.some((item) =>
        item.composerPrompt.includes('[native-composer-resource]'),
      ),
    'Referenced prompt reaches real provider',
  );
  const request = providerFixture.calls.find((item) =>
    item.composerPrompt.includes('[native-composer-resource]'),
  );
  assert.ok(
    request.composerPrompt.includes('README.md') &&
      request.composerPrompt.includes('Project Alpha') &&
      request.composerPrompt.includes('Continue paginated reads until EOF'),
  );
  await idle();
  await page
    .getByRole('region', { name: 'Referenced project files', exact: true })
    .getByText('README.md', { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('.chat-message.user')
      .filter({ hasText: 'Continue paginated reads until EOF' })
      .count(),
    0,
    'Human chat bubbles show reference chips instead of the wire contract',
  );
  await input().fill('Sticky draft that must return.');
  await input().press('ArrowUp');
  assert.equal(
    await input().inputValue(),
    '[native-composer-resource] Inspect the referenced project file.',
  );
  await input().press('ArrowDown');
  assert.equal(await input().inputValue(), 'Sticky draft that must return.');
  await input().fill('/unsupported-native-command');
  const beforeUnknown = providerFixture.calls.filter((call) => call.stream === true).length;
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'This desktop command is not available' })
    .waitFor();
  assert.equal(await input().inputValue(), '/unsupported-native-command');
  assert.equal(providerFixture.calls.filter((call) => call.stream === true).length, beforeUnknown);
  await input().fill(
    '/queue [native-composer-command] Run this request from a native slash command.',
  );
  await input().press('Enter');
  await waitFor(
    () =>
      providerFixture.calls.some((item) =>
        item.composerPrompt.startsWith('[native-composer-command]'),
      ),
    'Native queue command submits its argument, not the command string',
  );
  await idle();

  await input().fill('Keep this draft while inspecting context.');
  await page.getByRole('button', { name: 'Prompt journal', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Prompt journal', exact: true });
  await dialog.getByRole('region', { name: 'Project prompt journal', exact: true }).waitFor();
  const journal = await call('project', 'prompts.journal', {
    filter: { category: 'raw_user', sessionId: identity.sessionId, limit: 100 },
  });
  assert.ok(
    journal.entries.some((entry) => entry.content.includes('[native-composer-command]')),
    'Journal reads a prompt recorded by the actual conversation turn',
  );
  const refinedJournal = await call('project', 'prompts.journal', {
    filter: { category: 'refined_user', sessionId: identity.sessionId, limit: 100 },
  });
  assert.ok(
    refinedJournal.entries.some(
      (entry) =>
        entry.content.includes('[native-composer-refined-approved]') &&
        entry.rawContent?.includes('[native-composer-refine]'),
    ),
    'Approved refinement preserves actual original and final text in the project journal',
  );
  assert.ok(
    journal.entries.every(
      (entry) => entry.category === 'raw_user' && entry.sessionId === identity.sessionId,
    ),
  );
  await dialog
    .getByRole('textbox', { name: 'Search prompt journal', exact: true })
    .fill('[native-composer-command]');
  const entry = dialog.locator('.prompt-journal-list details').first();
  await entry.locator('summary').click();
  await page.screenshot({ path: join(artifactDir, 'native-prompt-journal.png'), fullPage: true });
  await entry.getByRole('button', { name: 'Reuse in draft', exact: true }).click();
  assert.ok(
    (await input().inputValue()).startsWith('Keep this draft while inspecting context.\n\n'),
  );
  await rpc('project.open', { projectId: otherProject.id });
  await waitFor(
    async () => (await rpc('project.status', { projectId: otherProject.id })).status === 'running',
    'Other project resources ready',
    100000,
  );
  const otherJournal = await call(
    'project',
    'prompts.journal',
    { filter: { category: 'raw_user', limit: 100 } },
    ['prompts.journal'],
    otherProject.id,
  );
  assert.ok(
    !otherJournal.entries.some((entry) => entry.content.includes('[native-composer-command]')),
    'Project prompt journals remain isolated',
  );

  await input().fill('/context ');
  const beforeContext = providerFixture.calls.filter((call) => call.stream === true).length;
  await input().press('Enter');
  dialog = page.getByRole('dialog', { name: 'Context & instructions', exact: true });
  await dialog.getByRole('region', { name: 'Estimated context sections', exact: true }).waitFor();
  assert.equal(
    providerFixture.calls.filter((call) => call.stream === true).length,
    beforeContext,
    'Context command does not become a model prompt',
  );
  const debug = await call('engine', 'context.debug');
  assert.ok(debug.total > 0 && debug.messages.count > 0);
  await dialog.getByRole('button', { name: 'Read effective instructions', exact: true }).click();
  await dialog.locator('.context-instructions .markdown-content').waitFor();
  await dialog.getByRole('button', { name: 'Repair protocol', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Context repair' }).waitFor();
  await waitFor(
    async () =>
      await dialog.getByRole('button', { name: 'Refresh context', exact: true }).isEnabled(),
    'Context readback after repair',
  );
  await page.screenshot({
    path: join(artifactDir, 'native-context-inspector.png'),
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Clear provider context', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep context', exact: true }).click();
  assert.ok((await call('engine', 'context.debug')).messages.count > 0);
  await page.setViewportSize({ width: 800, height: 640 });
  assert.equal(
    await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
    'Compact context inspector does not clip horizontally',
  );
  await page.screenshot({ path: join(artifactDir, 'native-context-compact.png'), fullPage: true });
  await page.setViewportSize({ width: 1480, height: 960 });
  await dialog.getByRole('button', { name: 'Clear provider context', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm clear context', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Context cleared' }).waitFor();
  assert.equal((await call('engine', 'context.debug')).messages.count, 0);
  assert.equal(
    (await engineRpc('snapshot')).sessions.length,
    sessionCount,
    'Project resources and context operations never create desktop sessions',
  );
  await dialog.getByRole('button', { name: 'Close context inspector', exact: true }).click();
  await page.locator(`[data-engine-session="${identity.sessionId}"]`).waitFor();
  const engineEvents = [];
  let engineOffset = 0;
  for (;;) {
    const batch = await engineRpc('engine.events', { id: agent.id, offset: engineOffset });
    engineEvents.push(...batch.events);
    if (!batch.hasMore) break;
    assert.ok(batch.offset > engineOffset, 'Conversation journal cursor advances');
    engineOffset = batch.offset;
  }
  assert.ok(
    !engineEvents.some((event) =>
      ['files.list', 'skills.list', 'prompts.list', 'prompts.journal'].includes(event.type),
    ),
    'Project resource reads never go through the conversation engine',
  );
  console.log(
    'PASS: native prompt templates/variables/favorites/recent/create/draft guard, actual project journal/reuse/isolation, @/$ keyboard pickers, reference chips/tab persistence, prompt recall, native slash commands, context/instructions/repair/clear and compact resources',
  );
}
