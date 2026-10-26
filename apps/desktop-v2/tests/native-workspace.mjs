import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function exerciseNativeWorkspace({ page, rpc, agent, artifactDir, waitFor }) {
  const tools = async (name) => {
    await page
      .getByRole('navigation', { name: 'Agent workspace views' })
      .getByRole('button', { name: 'Tools', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Project tools' });
    await dialog.getByRole('textbox', { name: 'Search project tools' }).fill(name);
    await dialog
      .getByRole('button')
      .filter({ has: page.locator('strong', { hasText: name }) })
      .first()
      .click();
  };
  await assert.rejects(
    rpc('engine.send', {
      id: agent.id,
      message: { type: 'working_dir.set', payload: { path: '..' } },
    }),
    /Desktop owns/,
  );
  await assert.rejects(
    rpc('engine.http', { id: agent.id, method: 'GET', resource: 'https://example.com/api/state' }),
    /relative|resource|path/i,
  );
  const response = await rpc('engine.http', {
    id: agent.id,
    method: 'GET',
    resource: '/api/automation/state?sessionId=foreign-session',
  });
  assert.equal(response.status, 200, 'Native HTTP binds the owning engine session');
  assert.ok(Array.isArray(response.data.jobs));
  await tools('Memory');
  await page
    .getByLabel('Memory text', { exact: true })
    .fill('Native workspace remembers project conventions.');
  await page.getByLabel('Memory tags', { exact: true }).fill('desktop, convention');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  const memories = page.getByRole('region', { name: 'Memories', exact: true });
  await memories
    .getByRole('button')
    .filter({ hasText: 'Native workspace remembers project conventions.' })
    .waitFor();
  await page.getByRole('heading', { name: 'Edit memory', exact: true }).waitFor();
  await page.getByLabel('Memory text', { exact: true }).fill('Updated native project convention.');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await memories
    .getByRole('button')
    .filter({ hasText: 'Updated native project convention.' })
    .waitFor();
  await page.getByRole('button', { name: 'Delete memory', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'explicit authorization' }).waitFor();
  assert.equal(
    await memories
      .getByRole('button')
      .filter({ hasText: 'Updated native project convention.' })
      .count(),
    1,
    'Unapproved deletion keeps the memory',
  );
  await page.getByText('Deletion and recovery options', { exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Explicitly allow deletion of a protected memory', exact: true })
    .check();
  await page.getByRole('button', { name: 'Delete memory', exact: true }).click();
  await waitFor(
    async () =>
      !(await memories
        .getByRole('button')
        .filter({ hasText: 'Updated native project convention.' })
        .count()),
    'Memory deletion readback',
  );
  await page.getByLabel('Memory status', { exact: true }).selectOption('deleted');
  await memories
    .getByRole('button')
    .filter({ hasText: 'Updated native project convention.' })
    .click();
  await page.getByRole('button', { name: 'Restore memory', exact: true }).click();
  await page.getByLabel('Memory status', { exact: true }).selectOption('active');
  await memories
    .getByRole('button')
    .filter({ hasText: 'Updated native project convention.' })
    .waitFor();
  await page.screenshot({ path: join(artifactDir, 'native-memory.png'), fullPage: true });
  await tools('Automations');
  await page.getByLabel('Automation name', { exact: true }).fill('Native workspace check');
  await page.getByLabel('Automation image', { exact: true }).fill('wrongstack:latest');
  await page
    .getByLabel('Automation instructions', { exact: true })
    .fill('Review this isolated fixture project and report its status.');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('heading', { name: 'Launch preview', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save automation', exact: true }).click();
  await page.getByRole('heading', { name: 'Edit automation', exact: true }).waitFor();
  await page.getByText('The engine saved this automation.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Enable', exact: true }).click();
  await page.getByRole('button', { name: 'Disable', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Queue run', exact: true }).click();
  await page.getByText('The engine queued this run.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel run', exact: true }).click();
  await waitFor(
    async () => !(await page.getByRole('button', { name: 'Cancel run', exact: true }).count()),
    'Offline automation cancellation',
  );
  await page.getByRole('button', { name: 'Disable', exact: true }).click();
  await page.getByRole('button', { name: 'Enable', exact: true }).waitFor();
  await page.screenshot({ path: join(artifactDir, 'native-automations.png'), fullPage: true });
  await page
    .getByRole('navigation', { name: 'Agent workspace views' })
    .getByRole('button', { name: 'Chat', exact: true })
    .click();
  console.log(
    'PASS: project-scoped native HTTP, memory create/edit/delete/restore, automation preview/save/enable/queue/cancel/disable',
  );
}
