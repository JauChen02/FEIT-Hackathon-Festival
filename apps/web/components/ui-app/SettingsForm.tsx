import { supportedTimezones } from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export function SettingsForm(props: {
  displayName: string;
  timezone: string;
  busy: boolean;
  error: string | null;
  saved: boolean;
  onName(value: string): void;
  onTimezone(value: string): void;
  onSubmit(): void;
}) {
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          value={props.displayName}
          maxLength={40}
          required
          onChange={(event) => props.onName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          className="w-full rounded-md border bg-background p-2"
          value={props.timezone}
          onChange={(event) => props.onTimezone(event.target.value)}
        >
          {[...new Set([props.timezone, ...supportedTimezones()])].map((zone) => (
            <option key={zone}>{zone}</option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          You can change timezone once every 24 hours. Past streak dates stay unchanged.
        </p>
      </div>
      {props.error ? <p role="alert">{props.error}</p> : null}
      {props.saved ? <p role="status">Settings saved.</p> : null}
      <Button disabled={props.busy} type="submit">
        {props.busy ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
