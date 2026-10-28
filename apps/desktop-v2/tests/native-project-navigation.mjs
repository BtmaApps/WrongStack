export async function revealProjectTools(page, project) {
  const navigation = page.getByRole('navigation', { name: `${project.name} workspace` });
  await navigation.waitFor();
  const tools = navigation.locator('details.project-extended-tools');
  if ((await tools.count()) && !(await tools.evaluate((element) => element.open)))
    await tools.locator('summary').click();
}
