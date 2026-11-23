import { useEffect, useState } from 'react';
import { groupThousands } from '../lib/money';

type Props = { label: string; value: number; onChange: (value: number) => void; placeholder?: string };
export function MoneyInput({ label, value, onChange, placeholder = '0' }: Props) {
  const [display, setDisplay] = useState(groupThousands(String(value || '')));
  useEffect(() => setDisplay(groupThousands(String(value || ''))), [value]);
  return <label className="field"><span>{label}</span><div className="money-input"><span>Rp</span><input
    inputMode="numeric" type="text" value={display} placeholder={placeholder}
    onChange={(event) => { const next = groupThousands(event.target.value); setDisplay(next); onChange(Number(next.replace(/\D/g, '') || 0)); }}
  /></div></label>;
}
