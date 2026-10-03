import { appendFile, readFile } from 'node:fs/promises';
import {
  DefaultSecretVault,
  decryptConfigSecrets,
  encryptConfigSecrets,
} from '@wrongstack/core/security';
import { atomicWrite, withFileLock } from '@wrongstack/core/utils';
import { createSubscriptionRefreshTransaction } from '../../src/subscription-refresh-store.ts';

const [configPath, keyPath, exchangeLog, sourceJson] = process.argv.slice(2);
const source = JSON.parse(sourceJson);
const vault = new DefaultSecretVault({ keyFile: keyPath });
const transaction = createSubscriptionRefreshTransaction((mutator) =>
  withFileLock(configPath, async () => {
    const config = decryptConfigSecrets(JSON.parse(await readFile(configPath, 'utf8')), vault);
    await mutator(config.providers);
    await atomicWrite(configPath, JSON.stringify(encryptConfigSecrets(config, vault)), {
      mode: 0o600,
    });
  }),
);
const result = await transaction('work', source, async (current) => {
  await appendFile(exchangeLog, 'exchange\n');
  // Keep the lock over the token endpoint latency as well as the write.
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    ...current,
    apiKey: 'renewed-access',
    refreshToken: 'renewed-refresh',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
});
if (result.apiKey !== 'renewed-access' || result.refreshToken !== 'renewed-refresh')
  process.exitCode = 1;
