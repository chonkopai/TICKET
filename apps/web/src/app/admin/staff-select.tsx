"use client";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { OptionPicker } from "../../components/option-picker";

export function StaffSelect({ children, value, onChange, disabled = false, ...props }: {
  children: ReactNode;
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const options = Children.toArray(children).filter(isValidElement).map(child => {
    const option = child as ReactElement<{ value: string; children: ReactNode; disabled?: boolean }>;
    return { value: option.props.value, label: Children.toArray(option.props.children).join(""), disabled: option.props.disabled };
  });
  return <OptionPicker className="staff-select" label={props["aria-label"] ?? options[0]?.label ?? ""} value={value} options={options} disabled={disabled} onChange={next => onChange({ target: { value: next } })} />;
}
