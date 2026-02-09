

## Add Carrier Dependency Statement Format Template

A small UI enhancement to the Declared Position card that adds a persistent, visible format template below the Carrier Dependency Statement field so you always have the correct structure in front of you.

### What Changes

In `src/components/claim-detail/DarwinDeclaredPosition.tsx`:

- Add a helper text block beneath the Carrier Dependency Statement textarea (in edit mode) showing the template:

  *"For the carrier's conclusion to be correct, the damage would need to result from [Carrier's Argument] rather than [Forensic Reality]."*

- Also add this same template in the read-only view when the field shows "Not set", so the format is always visible as a reminder.

- The template text will be styled as a subtle, muted hint (small italic text) so it doesn't clutter the form but is always accessible.

### Technical Detail

- Add a `<p>` element with `text-xs text-muted-foreground italic` styling directly after the Carrier Dependency Statement `<Textarea>` in the editing block (~line 158).
- Optionally add the same hint in the display block (~line 194) when the value is empty.

Single file change, no database or backend modifications needed.

