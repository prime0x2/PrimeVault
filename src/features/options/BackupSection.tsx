import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { ExportEncryptedForm } from './ExportEncryptedForm';
import { ExportPlaintextForm } from './ExportPlaintextForm';
import { ImportEncryptedForm } from './ImportEncryptedForm';

type Flow = 'idle' | 'export' | 'import' | 'plaintext';

export function BackupSection(): React.ReactElement {
  // Mutually exclusive sub-flows: opening one collapses the others.
  const [flow, setFlow] = useState<Flow>('idle');

  function reset(): void {
    setFlow('idle');
  }

  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <h2 className="font-semibold text-base tracking-tight">Backup</h2>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-sm">Export encrypted backup</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Downloads your encrypted vault as a JSON file. Decryptable only
              with your master password.
            </p>
          </div>
          {flow !== 'export' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFlow('export')}
              disabled={flow !== 'idle'}
            >
              Export…
            </Button>
          )}
        </div>
        {flow === 'export' && (
          <ExportEncryptedForm onCancel={reset} onDone={reset} />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-sm">Import encrypted backup</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Replaces the current vault with a previously exported backup file.
              You'll need the password the file was exported with.
            </p>
          </div>
          {flow !== 'import' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFlow('import')}
              disabled={flow !== 'idle'}
            >
              Import…
            </Button>
          )}
        </div>
        {flow === 'import' && (
          <ImportEncryptedForm onCancel={reset} onImported={reset} />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-destructive text-sm">
              Export plaintext (advanced)
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Decrypts every entry and writes them to a JSON file. Use only if
              you understand the risks — the file has no password protection.
            </p>
          </div>
          {flow !== 'plaintext' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFlow('plaintext')}
              disabled={flow !== 'idle'}
            >
              Export plaintext…
            </Button>
          )}
        </div>
        {flow === 'plaintext' && (
          <ExportPlaintextForm onCancel={reset} onDone={reset} />
        )}
      </div>
    </section>
  );
}
