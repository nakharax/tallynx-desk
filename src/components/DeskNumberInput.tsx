import { useState, type ComponentPropsWithoutRef } from 'react';

interface DeskNumberInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value' | 'onChange' | 'onBlur' | 'min' | 'max'> {
  value: number | null;
  onValue: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  decimals?: number;
  emptyValue?: number;
  formattedValue?: string;
}

export function DeskNumberInput({
  value, onValue, min = 0, max = Infinity, integer = false, decimals, emptyValue, formattedValue, ...props
}: DeskNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = value === null ? '' : decimals === undefined ? String(value) : value.toFixed(decimals);

  return (
    <input
      {...props}
      type="text"
      inputMode={min < 0 ? 'text' : integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={draft ?? formattedValue ?? displayValue}
      onFocus={(event) => {
        if (formattedValue !== undefined) setDraft(displayValue);
        props.onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        setDraft(raw);
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim())) return;
        const next = Number(raw);
        if (Number.isFinite(next) && next >= min && next <= max && (!integer || Number.isInteger(next))) {
          onValue(next);
        }
      }}
      onBlur={() => {
        if (draft?.trim() === '' && emptyValue !== undefined) onValue(emptyValue);
        setDraft(null);
      }}
    />
  );
}
