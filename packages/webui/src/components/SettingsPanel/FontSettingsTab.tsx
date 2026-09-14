import { RotateCcw } from 'lucide-react';
import { useEffect, useId } from 'react';
import { useFontSettings } from '@/hooks/use-font-settings';
import { useAppTranslation } from '@/i18n';
import {
  CODE_LIGATURE_FEATURES_OFF,
  CODE_LIGATURE_FEATURES_ON,
  DEFAULT_FONT_SETTINGS,
  DERIVED_ROLE_PARENT,
  FONT_PRESETS,
  FONT_ROLES,
  FONT_SIZE_LIMITS,
  type FontCategory,
  type FontFamilyId,
  type FontRole,
  type FontSettings,
  fallbackFontFamily,
  fontFamiliesForRole,
  getFontFamily,
  getFontPreset,
  isDerivedRole,
  loadFontFamilies,
  matchSizePreset,
  resolveFontFamilies,
  resolveFontStacks,
  SIZE_PRESETS,
} from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores';
import { Button } from '../ui/button';
import { PreferenceSlider } from './PreferenceControls';
import { PreferenceToggle } from './PreferenceToggle';

const CATEGORY_ORDER: readonly FontCategory[] = ['sans', 'serif', 'mono'];
const ROLE_SAMPLE = 'Aa Bb Çç Ğğ Şş 0123 {} => !==';
const CARD_CODE_SAMPLE = 'if (a !== b) return a => b;';
const EDITOR_SAMPLE = `export function mergeTurns(a: Session, b: Session) {
  if (a.id !== b.id) return null; // => nothing to merge
  return { ...a, turns: [...a.turns, ...b.turns] };
}`;
const TERMINAL_SAMPLE = `$ pnpm --filter @wrongstack/webui test
 ✓ tests/lib/fonts.test.ts (18 tests) 42ms
 Test Files  1 passed (1)`;

function withPreset(presetId: FontSettings['preset']): FontSettings {
  return { ...DEFAULT_FONT_SETTINGS, preset: presetId };
}

function SectionHeading({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FontRolePicker({
  role,
  settings,
  onChange,
}: {
  role: FontRole;
  settings: FontSettings;
  onChange: (role: FontRole, familyId: string) => void;
}) {
  const { t } = useAppTranslation();
  const inputId = useId();
  const current = getFontFamily(resolveFontFamilies(settings)[role]);
  const fallback = getFontFamily(fallbackFontFamily(settings, role));
  const followsParent = isDerivedRole(role) && !getFontPreset(settings.preset).families[role];
  const defaultLabel = followsParent
    ? t('settings:fonts.inherit', {
        role: t(
          `settings:fonts.roles.${DERIVED_ROLE_PARENT[role as keyof typeof DERIVED_ROLE_PARENT]}.label`,
        ),
        name: fallback.label,
      })
    : t('settings:fonts.fromPreset', { name: fallback.label });
  const options = fontFamiliesForRole(role);

  return (
    <div className="grid gap-2 border-b border-border/50 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t(`settings:fonts.roles.${role}.label`)}
        </label>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {t(`settings:fonts.roles.${role}.hint`)}
        </div>
        <div
          aria-hidden
          className="mt-1.5 truncate text-sm text-foreground"
          style={{
            fontFamily: current.stack,
            // Samples inherit the body's ligature features; show code faces
            // the way the ligature setting will actually render them.
            ...(current.category === 'mono' && {
              fontFeatureSettings: settings.ligatures
                ? CODE_LIGATURE_FEATURES_ON
                : CODE_LIGATURE_FEATURES_OFF,
            }),
          }}
        >
          {current.label} — {ROLE_SAMPLE}
        </div>
      </div>
      <select
        id={inputId}
        value={settings.overrides[role] ?? ''}
        onChange={(event) => onChange(role, event.target.value)}
        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      >
        <option value="">{defaultLabel}</option>
        {CATEGORY_ORDER.map((category) => {
          const group = options.filter((family) => family.category === category);
          if (group.length === 0) return null;
          return (
            <optgroup key={category} label={t(`settings:fonts.categories.${category}`)}>
              {group.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.source === 'system'
                    ? `${family.label} (${t('settings:fonts.systemTag')})`
                    : family.label}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}

export function FontSettingsTab() {
  const { t } = useAppTranslation();
  const setFonts = useConfigStore((state) => state.setFonts);
  const { settings, editor, terminal } = useFontSettings();
  const activeSize = matchSizePreset(settings);
  const hasOverrides = Object.keys(settings.overrides).length > 0;

  const update = (patch: Partial<FontSettings>) => setFonts({ ...settings, ...patch });

  const setOverride = (role: FontRole, familyId: string) => {
    const overrides = { ...settings.overrides };
    if (familyId) {
      overrides[role] = familyId as FontFamilyId;
    } else {
      delete overrides[role];
    }
    update({ overrides });
  };

  // Preset cards render in their own faces — fetch those once when the tab opens.
  useEffect(() => {
    void loadFontFamilies(
      FONT_PRESETS.flatMap((entry) => Object.values(resolveFontFamilies(withPreset(entry.id)))),
    );
  }, []);

  return (
    <div className="mt-0 space-y-8">
      <section>
        <SectionHeading
          title={t('settings:fonts.presetsHeading')}
          hint={t('settings:fonts.presetsHint')}
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {FONT_PRESETS.map((entry) => {
            const stacks = resolveFontStacks(withPreset(entry.id));
            const families = resolveFontFamilies(withPreset(entry.id));
            const active = settings.preset === entry.id;
            const familyNames = [...new Set([families.ui, families.display, families.code])]
              .map((id) => getFontFamily(id).label)
              .join(' · ');
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ preset: entry.id, overrides: {} })}
                className={cn(
                  'flex min-w-0 flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border/70 bg-background/60 hover:bg-accent/60',
                )}
              >
                <span
                  className="text-base font-semibold leading-tight text-foreground"
                  style={{ fontFamily: stacks.display }}
                >
                  {t(entry.labelKey)}
                </span>
                <span className="text-xs text-muted-foreground" style={{ fontFamily: stacks.ui }}>
                  {t(entry.descriptionKey)}
                </span>
                <span
                  aria-hidden
                  className="w-full truncate text-[11px] text-muted-foreground"
                  style={{
                    fontFamily: stacks.code,
                    fontFeatureSettings: settings.ligatures
                      ? CODE_LIGATURE_FEATURES_ON
                      : CODE_LIGATURE_FEATURES_OFF,
                  }}
                >
                  {CARD_CODE_SAMPLE}
                </span>
                <span className="w-full truncate text-[10px] text-muted-foreground/80">
                  {familyNames}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeading
          title={t('settings:fonts.rolesHeading')}
          hint={t('settings:fonts.rolesHint')}
        />
        <div className="rounded-md border border-border/70 bg-card/40 px-4">
          {FONT_ROLES.map((role) => (
            <FontRolePicker key={role} role={role} settings={settings} onChange={setOverride} />
          ))}
        </div>
        {hasOverrides && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => update({ overrides: {} })}
          >
            {t('settings:fonts.resetOverrides')}
          </Button>
        )}
      </section>

      <section>
        <SectionHeading
          title={t('settings:fonts.sizeHeading')}
          hint={t('settings:fonts.sizeHint')}
        />
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {SIZE_PRESETS.map((entry) => (
            <Button
              key={entry.id}
              variant={activeSize === entry.id ? 'default' : 'outline'}
              size="sm"
              aria-pressed={activeSize === entry.id}
              onClick={() => update(entry.values)}
            >
              {t(entry.labelKey)}
            </Button>
          ))}
          {activeSize === null && (
            <span className="text-xs text-muted-foreground">
              {t('settings:fonts.sizePresets.custom')}
            </span>
          )}
        </div>
        <div className="max-w-xl">
          <PreferenceSlider
            label={t('settings:fonts.controls.uiScale.label')}
            hint={t('settings:fonts.controls.uiScale.hint')}
            value={Math.round(settings.uiScale * 100)}
            min={FONT_SIZE_LIMITS.uiScale.min * 100}
            max={FONT_SIZE_LIMITS.uiScale.max * 100}
            step={FONT_SIZE_LIMITS.uiScale.step * 100}
            unit="%"
            onChange={(value) => update({ uiScale: value / 100 })}
          />
          <PreferenceSlider
            label={t('settings:fonts.controls.editorFontSize.label')}
            hint={t('settings:fonts.controls.editorFontSize.hint')}
            value={settings.editorFontSize}
            {...FONT_SIZE_LIMITS.editorFontSize}
            unit="px"
            onChange={(value) => update({ editorFontSize: value })}
          />
          <PreferenceSlider
            label={t('settings:fonts.controls.codeLineHeight.label')}
            hint={t('settings:fonts.controls.codeLineHeight.hint')}
            value={settings.codeLineHeight}
            {...FONT_SIZE_LIMITS.codeLineHeight}
            onChange={(value) => update({ codeLineHeight: value })}
          />
          <PreferenceSlider
            label={t('settings:fonts.controls.terminalFontSize.label')}
            hint={t('settings:fonts.controls.terminalFontSize.hint')}
            value={settings.terminalFontSize}
            {...FONT_SIZE_LIMITS.terminalFontSize}
            unit="px"
            onChange={(value) => update({ terminalFontSize: value })}
          />
          <PreferenceSlider
            label={t('settings:fonts.controls.terminalLineHeight.label')}
            hint={t('settings:fonts.controls.terminalLineHeight.hint')}
            value={settings.terminalLineHeight}
            {...FONT_SIZE_LIMITS.terminalLineHeight}
            onChange={(value) => update({ terminalLineHeight: value })}
          />
          <PreferenceToggle
            label={t('settings:fonts.controls.ligatures.label')}
            hint={t('settings:fonts.controls.ligatures.hint')}
            value={settings.ligatures}
            onChange={() => update({ ligatures: !settings.ligatures })}
          />
        </div>
      </section>

      <section>
        <SectionHeading title={t('settings:fonts.previewHeading')} />
        <div className="space-y-3 rounded-md border border-border/70 bg-card/60 p-4">
          <h3 className="text-lg font-semibold leading-tight">
            {t('settings:fonts.preview.heading')}
          </h3>
          <div className="markdown-content text-sm">
            <p className="!mb-0">
              {t('settings:fonts.preview.body')} <code>loadSession()</code>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded border border-border/70 px-2 py-0.5">
              {t('settings:fonts.preview.label')}
            </span>
            <span className="font-mono">sess_7f3a · 12.4k tok · 00:42</span>
          </div>
          <pre
            className="overflow-x-auto rounded border border-border/70 bg-background/70 p-3"
            style={{
              fontFamily: editor.fontFamily,
              fontSize: `${editor.fontSize}px`,
              lineHeight: `${editor.lineHeight}px`,
              fontFeatureSettings: editor.fontLigatures
                ? CODE_LIGATURE_FEATURES_ON
                : CODE_LIGATURE_FEATURES_OFF,
            }}
          >
            {EDITOR_SAMPLE}
          </pre>
          <pre
            className="overflow-x-auto rounded border border-border/70 bg-foreground p-3 text-background"
            style={{
              fontFamily: terminal.fontFamily,
              fontSize: `${terminal.fontSize}px`,
              lineHeight: terminal.lineHeight,
              fontFeatureSettings: CODE_LIGATURE_FEATURES_OFF,
            }}
          >
            {TERMINAL_SAMPLE}
          </pre>
        </div>
      </section>

      <div className="border-t pt-4">
        <Button variant="outline" size="sm" onClick={() => setFonts(DEFAULT_FONT_SETTINGS)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {t('settings:fonts.resetAll')}
        </Button>
      </div>
    </div>
  );
}
