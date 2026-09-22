import { useEffect, useState } from 'react';
import { toast } from '@/components/Toaster';
import { useAppTranslation } from '@/i18n';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import type { MCPServerConfig } from './contracts.js';
import type { MCPServer } from './MCPServerCards.js';

/** Edit/Add Server Dialog */
export function ServerDialog({
  open,
  onOpenChange,
  server,
  onSave,
  prefillConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: MCPServer;
  prefillConfig?: MCPServerConfig;
  onSave: (config: MCPServerConfig) => void;
}) {
  const { t } = useAppTranslation();
  const [name, setName] = useState(server?.name ?? prefillConfig?.name ?? '');
  const [transport, setTransport] = useState(
    server?.transport ?? prefillConfig?.transport ?? 'stdio',
  );
  const [description, setDescription] = useState(
    server?.description ?? prefillConfig?.description ?? '',
  );
  const [command, setCommand] = useState(prefillConfig?.command ?? '');
  const [args, setArgs] = useState(prefillConfig?.args?.join(' ') ?? '');
  const [env, setEnv] = useState('');
  const [url, setUrl] = useState(prefillConfig?.url ?? '');
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [lazy, setLazy] = useState(server?.lazy ?? prefillConfig?.lazy ?? false);

  // Reset form when dialog opens with new prefill data
  useEffect(() => {
    if (open) {
      if (server) {
        setName(server.name);
        setTransport(server.transport);
        setDescription(server.description ?? '');
        setEnabled(server.enabled);
        setLazy(server.lazy ?? false);
        setCommand(server.command ?? '');
        setArgs(server.args?.join(' ') ?? '');
        setEnv(
          server.env
            ? Object.entries(server.env)
                .map(([k, v]) => `${k}=${v}`)
                .join('\n')
            : '',
        );
        setUrl(server.url ?? '');
      } else if (prefillConfig) {
        setName(prefillConfig.name);
        setTransport(prefillConfig.transport);
        setDescription(prefillConfig.description ?? '');
        setEnabled(true);
        setLazy(prefillConfig.lazy ?? false);
        setCommand(prefillConfig.command ?? '');
        setArgs(prefillConfig.args?.join(' ') ?? '');
        setEnv(
          prefillConfig.env
            ? Object.entries(prefillConfig.env)
                .map(([k, v]) => `${k}=${v}`)
                .join('\n')
            : '',
        );
        setUrl(prefillConfig.url ?? '');
      } else {
        setName('');
        setTransport('stdio');
        setDescription('');
        setEnabled(true);
        setLazy(false);
        setCommand('');
        setArgs('');
        setEnv('');
        setUrl('');
      }
    }
  }, [server, prefillConfig, open]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error(t('settings:mcp.serverNameRequired'));
      return;
    }
    const parsedEnv: Record<string, string> = {};
    if (env.trim()) {
      for (const line of env.trim().split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) {
          parsedEnv[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
      }
    }
    onSave({
      name: name.trim(),
      transport,
      description: description.trim() || undefined,
      enabled,
      command: command.trim() || undefined,
      args: args.trim() ? args.trim().split(/\s+/) : undefined,
      env: Object.keys(parsedEnv).length > 0 ? parsedEnv : undefined,
      url: url.trim() || undefined,
      lazy,
    });
    onOpenChange(false);
  };

  const isEdit = !!server;
  const isPrefill = !!prefillConfig;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('settings:mcp.dialogTitleEdit')
              : isPrefill
                ? t('settings:mcp.dialogTitleAdd')
                : t('settings:mcp.dialogTitleAddCustom')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('settings:mcp.fieldName')}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings:mcp.fieldNamePlaceholder')}
              disabled={isEdit || isPrefill}
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('settings:mcp.fieldTransport')}</span>
            <select
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              disabled={isPrefill}
            >
              <option value="stdio">stdio</option>
              <option value="sse">sse</option>
              <option value="streamable-http">streamable-http</option>
              <option value="http">http</option>
            </select>
          </div>
          {(transport === 'streamable-http' || transport === 'sse' || transport === 'http') && (
            <div className="space-y-2">
              <span className="text-sm font-medium">{t('settings:mcp.fieldUrl')}</span>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('activity:mCPSection.httpsMcpExampleComMcp')}
                disabled={isPrefill}
              />
            </div>
          )}
          {transport === 'stdio' && (
            <>
              <div className="space-y-2">
                <span className="text-sm font-medium">{t('settings:mcp.fieldCommand')}</span>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={t('settings:mcp.fieldCommandPlaceholder')}
                  disabled={isPrefill}
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  {t('settings:mcp.fieldArgs')}{' '}
                  <span className="text-muted-foreground font-normal">
                    {t('settings:mcp.fieldArgsHint')}
                  </span>
                </span>
                <Input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder={t('settings:mcp.fieldArgsPlaceholder')}
                  disabled={isPrefill}
                />
              </div>
            </>
          )}
          <div className="space-y-2">
            <span className="text-sm font-medium">
              {t('settings:mcp.fieldEnv')}{' '}
              <span className="text-muted-foreground font-normal">
                {t('settings:mcp.fieldEnvHint')}
              </span>
            </span>
            <textarea
              className="w-full h-20 px-3 py-2 rounded-md border border-input bg-background text-sm font-mono resize-none"
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder={`GITHUB_TOKEN=ghp_...\nAWS_REGION=us-east-1`}
              // Env stays editable even for a prefilled official server — this is
              // where the user pastes the credentials it requires before enabling.
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('settings:mcp.fieldDescription')}</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('settings:mcp.fieldDescriptionPlaceholder')}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="server-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="server-enabled" className="text-sm">
              {t('settings:mcp.enableServer')}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="server-lazy"
              checked={lazy}
              onChange={(e) => setLazy(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="server-lazy" className="text-sm">
              {t('settings:mcp.lazyConnect')}{' '}
              <span className="text-muted-foreground font-normal">
                {t('settings:mcp.lazyConnectHint')}
              </span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:action.cancel')}
          </Button>
          <Button onClick={handleSave}>
            {isEdit ? t('settings:mcp.saveChanges') : t('settings:mcp.addServer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
