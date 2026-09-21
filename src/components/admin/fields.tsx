import type { InputHTMLAttributes } from 'react';
export function Field({ label, name, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <label className="admin-field"><span>{label}</span><input name={name} {...props} /></label>;
}
export function Area({ label, name, value }: { label: string; name: string; value?: string | null }) { return <label className="admin-field"><span>{label}</span><textarea name={name} defaultValue={value ?? ''} rows={3} /></label>; }
export function Check({ label, name, checked = true }: { label: string; name: string; checked?: boolean }) { return <label className="admin-check"><input type="checkbox" name={name} defaultChecked={checked} />{label}</label>; }
