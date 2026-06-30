"use client";

import { useEffect, useRef, useState } from "react";

const SPEAKER_COLORS = [
	"var(--color-speaker-1)",
	"var(--color-speaker-2)",
	"var(--color-speaker-3)",
	"var(--color-speaker-4)",
];

interface SpeakerChipProps {
	label: string;
	index: number;
	onChange: (newName: string) => void;
}

export default function SpeakerChip({
	label,
	index,
	onChange,
}: SpeakerChipProps) {
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(label);
	const inputRef = useRef<HTMLInputElement>(null);
	const color = SPEAKER_COLORS[index % SPEAKER_COLORS.length];

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	function commit() {
		setEditing(false);
		if (value.trim() !== label) onChange(value.trim() || label);
	}

	if (editing) {
		return (
			<input
				ref={inputRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && commit()}
				className="text-xs px-2 py-0.5 rounded-full border outline-none"
				style={{ borderColor: color, color }}
			/>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setEditing(true)}
			title="Cliquer pour renommer / Click to rename"
			className="text-xs px-2 py-0.5 rounded-full font-medium"
			style={{ background: `${color}20`, color }}
		>
			{value} ✎
		</button>
	);
}
