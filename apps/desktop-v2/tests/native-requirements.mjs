import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  AllowAllIntakeAuthorizer,
  RequirementIntakeService,
  RequirementIntakeStore,
} from '../../../packages/requirement-intake/dist/index.js';
import { exerciseNativeRequirementDrafts } from './native-requirement-drafts.mjs';
import { exerciseNativeRequirementRecordDrafts } from './native-requirement-record-drafts.mjs';
import { exerciseNativeResourceInput } from './native-requirement-resource-input.mjs';

export async function exerciseNativeRequirements({
  page,
  rpc,
  project,
  artifactDir,
  intakeStoreDir,
  waitFor,
  restartUi,
  otherProject,
}) {
  let sdd = page.getByRole('region', { name: 'Project SDD' });
  await sdd.getByRole('button', { name: 'Requirements', exact: true }).click();
  let requirements = sdd.getByRole('region', { name: 'Project requirements' });
  await requirements
    .getByRole('button', { name: 'New requirement', exact: true })
    .click({ timeout: 60000 });
  const original = '  Build the native intake workflow.\nPreserve this exact request.\n';
  await requirements.getByLabel('Original request', { exact: true }).fill(original);
  await requirements
    .getByLabel('Requirement title', { exact: true })
    .fill('Native requirement fixture');
  await requirements.getByLabel('Request type', { exact: true }).selectOption('feature');
  await requirements.getByLabel('Attachment name', { exact: true }).fill('Design brief');
  await requirements.getByLabel('Attachment reference', { exact: true }).fill('docs/design.md');
  await requirements.getByRole('button', { name: 'Add attachment reference', exact: true }).click();
  await requirements.getByLabel('Related resource title', { exact: true }).fill('Tracked issue');
  await requirements.getByLabel('Related resource kind', { exact: true }).selectOption('issue');
  await requirements.getByLabel('Related resource reference', { exact: true }).fill('#42');
  await requirements.getByRole('button', { name: 'Add related resource', exact: true }).click();
  const recovery = await exerciseNativeRequirementDrafts({
    page,
    project,
    otherProject,
    waitFor,
    restartUi,
    original,
    artifactDir,
  });
  page = recovery.page;
  sdd = page.getByRole('region', { name: 'Project SDD' });
  requirements = sdd.getByRole('region', { name: 'Project requirements' });
  await requirements.getByRole('button', { name: 'Save draft', exact: true }).click();
  await requirements
    .getByText('Requirement draft recorded.', { exact: true })
    .waitFor({ timeout: 60000 });
  const clearedDraft = await page.evaluate(
    (id) =>
      window.__TAURI_INTERNALS__.invoke('host_request', {
        method: 'form-draft.get',
        params: { projectId: id, formKey: 'requirements-new' },
      }),
    project.id,
  );
  assert.equal(
    clearedDraft.value,
    null,
    'A recorded intake clears its persisted new-request draft',
  );
  assert.ok(clearedDraft.revision > 0, 'Clearing retains a revision tombstone');
  const get = async (resource) => {
    const response = await rpc('project.http', {
      projectId: project.id,
      resource,
      method: 'GET',
      body: null,
    });
    assert.equal(response.ok, true, `GET ${resource}`);
    return response.data;
  };
  const catalog = await get('/api/requirement-intakes');
  const row = catalog.intakes.find((item) => item.title === 'Native requirement fixture');
  assert.ok(row);
  assert.equal(row.id, recovery.expectedIntakeId, 'Retry returns the server-accepted record');
  assert.equal(
    catalog.intakes.filter((item) => item.title === 'Native requirement fixture').length,
    1,
    'Native JSON reordering cannot duplicate a retried intake',
  );
  let stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.equal(stored.originalRequest, original, 'Original request stays verbatim');
  assert.equal(stored.status, 'draft');
  assert.equal(stored.idempotencyKey, recovery.retryKey);
  assert.equal(stored.attachments[0].path, 'docs/design.md');
  assert.equal(stored.relatedResources[0].reference, '#42');
  await requirements.getByText('Design brief', { exact: true }).waitFor();
  await requirements.getByText('Tracked issue', { exact: true }).waitFor();
  const pending = await exerciseNativeResourceInput({
    page,
    project,
    intakeId: row.id,
    waitFor,
    restartUi,
  });
  page = pending.page;
  sdd = page.getByRole('region', { name: 'Project SDD' });
  requirements = sdd.getByRole('region', { name: 'Project requirements' });
  const append = requirements.locator('.requirement-append');
  await append.getByLabel('Resource name', { exact: true }).fill('Follow-up note');
  await append.getByLabel('Resource reference', { exact: true }).fill('docs/followup.md');
  await append.getByRole('button', { name: 'Save resource', exact: true }).click();
  await requirements.getByText('Supporting resource saved.', { exact: true }).waitFor();
  await waitFor(
    async () => (await pending.stored()).value === null,
    'Saved resource clears its unsent input',
  );
  stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.equal(stored.attachments.length, 2);
  assert.equal(stored.attachments[1].path, 'docs/followup.md');
  await requirements.getByText('Add supporting resource', { exact: true }).click();
  const producer = new RequirementIntakeService({
    store: new RequirementIntakeStore({ baseDir: intakeStoreDir }),
    authorizer: new AllowAllIntakeAuthorizer(),
    generator: {
      generate: async () => ({
        suggested_title: 'Native requirement fixture refined',
        suggested_outcome: 'Proposed outcome not accepted',
      }),
    },
  });
  await producer.generateSuggestions(row.id, {
    id: 'native-suggestion-fixture',
    type: 'agent',
    projectId: catalog.projectId,
  });
  await requirements.getByRole('button', { name: /Native requirement fixture/ }).click();
  const titleProposal = requirements
    .locator('.requirement-suggestions article')
    .filter({ hasText: 'Native requirement fixture refined' });
  await titleProposal.getByRole('button', { name: 'Accept suggestion', exact: true }).click();
  await requirements.getByText('Suggestion accepted.', { exact: true }).waitFor();
  const outcomeProposal = requirements
    .locator('.requirement-suggestions article')
    .filter({ hasText: 'Proposed outcome not accepted' });
  await outcomeProposal.getByRole('button', { name: 'Reject suggestion', exact: true }).click();
  await requirements.getByText('Suggestion rejected.', { exact: true }).waitFor();
  stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.equal(stored.title, 'Native requirement fixture refined');
  assert.notEqual(stored.expectedOutcome, 'Proposed outcome not accepted');
  assert.deepEqual(
    stored.llmSuggestions.map((item) => item.status),
    ['accepted', 'rejected'],
  );
  assert.equal(stored.originalRequest, original);
  await requirements
    .getByRole('heading', { name: 'Supporting resources', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifactDir, 'native-requirement-resources.png'),
    fullPage: true,
  });
  page = await exerciseNativeRequirementRecordDrafts({
    page,
    project,
    intakeId: row.id,
    rpc,
    waitFor,
    restartUi,
    artifactDir,
  });
  sdd = page.getByRole('region', { name: 'Project SDD' });
  requirements = sdd.getByRole('region', { name: 'Project requirements' });
  await requirements.getByRole('button', { name: 'Edit information', exact: true }).click();
  await requirements
    .getByLabel('Expected outcome', { exact: true })
    .fill('A complete native requirements flow.');
  await requirements.getByRole('button', { name: 'Save information', exact: true }).click();
  await requirements.getByText('Requirement information saved.', { exact: true }).waitFor();
  stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.equal(stored.expectedOutcome, 'A complete native requirements flow.');
  assert.equal(stored.originalRequest, original);
  await requirements.getByRole('button', { name: 'Edit information', exact: true }).click();
  await requirements
    .getByLabel('Business goal', { exact: true })
    .fill('Keep this unsaved conflict draft.');
  const concurrent = await rpc('project.http', {
    projectId: project.id,
    resource: `/api/requirement-intakes/${row.id}`,
    method: 'PATCH',
    body: { priority: 'high', expectedVersion: stored.version },
  });
  assert.equal(concurrent.ok, true, 'Concurrent writer updates the record');
  await requirements.getByRole('button', { name: 'Save information', exact: true }).click();
  await requirements
    .getByRole('alert')
    .filter({ hasText: /modified concurrently/ })
    .waitFor();
  assert.equal(
    await requirements.getByLabel('Business goal', { exact: true }).inputValue(),
    'Keep this unsaved conflict draft.',
  );
  stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.equal(stored.priority, 'high');
  assert.notEqual(stored.businessGoal, 'Keep this unsaved conflict draft.');
  await requirements.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await requirements.getByRole('button', { name: /Native requirement fixture/ }).click();
  const question = requirements
    .locator('.requirement-questions article')
    .filter({ hasText: 'unanswered' })
    .first();
  await question.locator('textarea').fill('Native answer retains the project context.');
  await question.getByRole('button', { name: 'Record answer', exact: true }).click();
  await requirements.getByText('Answer recorded.', { exact: true }).waitFor();
  stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.ok(
    stored.answers.some((item) => item.answer === 'Native answer retains the project context.'),
  );
  await requirements.getByRole('button', { name: 'Prepare SDD interview', exact: true }).click();
  assert.equal(await sdd.getByLabel('Project outcome', { exact: true }).inputValue(), original);
  await sdd.getByRole('button', { name: 'Requirements', exact: true }).click();
  await requirements.getByRole('button', { name: 'Submit requirement', exact: true }).click();
  await requirements.getByText('Requirement submitted.', { exact: true }).waitFor();
  stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.equal(stored.status, 'submitted');
  await requirements.getByRole('button', { name: 'Archive requirement', exact: true }).click();
  await requirements.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await requirements.getByText('Requirement archived.', { exact: true }).waitFor();
  stored = await get(`/api/requirement-intakes/${row.id}`);
  assert.equal(stored.status, 'archived');
  assert.equal(
    (await rpc('snapshot')).sessions.length,
    0,
    'Requirements need no desktop conversation',
  );
  await requirements
    .getByRole('heading', { name: 'Requirements', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifactDir, 'native-project-requirements.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log(
    'PASS: project requirement create, versioned edit, answer, SDD draft transfer, submit and archive',
  );
}
