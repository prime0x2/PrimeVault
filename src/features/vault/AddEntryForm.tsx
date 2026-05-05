import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { EntryForm } from './EntryForm';

interface AddEntryFormProps {
  onAdded: () => void;
}

/**
 * Top-of-popup affordance for creating a new entry. Collapsed by default to
 * a single "+ Add entry" button (per SPEC §10.2). When expanded, renders
 * the shared {@link EntryForm} in add mode. After save or cancel, collapses
 * back to the button.
 */
export function AddEntryForm({
  onAdded,
}: AddEntryFormProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <div className="border-b border-b-emerald-700 p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => setExpanded(true)}
        >
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b border-b-emerald-700 bg-muted/30 p-3">
      <EntryForm
        onSaved={() => {
          setExpanded(false);
          onAdded();
        }}
        onCancel={() => setExpanded(false)}
      />
    </div>
  );
}
