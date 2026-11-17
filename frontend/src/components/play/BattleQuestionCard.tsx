'use client';

import type { BattleQuestion } from '@/types/quiz-battle';

interface BattleQuestionCardProps {
    question: BattleQuestion;
    selected: 'A' | 'B' | 'C' | 'D' | null;
    onSelect: (letter: 'A' | 'B' | 'C' | 'D') => void;
    disabled?: boolean;
}

const OPTIONS: Array<{ key: 'A' | 'B' | 'C' | 'D'; label: string }> = [
    { key: 'A', label: 'A' },
    { key: 'B', label: 'B' },
    { key: 'C', label: 'C' },
    { key: 'D', label: 'D' },
];

export function BattleQuestionCard({ question, selected, onSelect, disabled }: BattleQuestionCardProps) {
    return (
        <div>
            <h2 className="mb-4 text-lg font-medium">{question.prompt}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {OPTIONS.map(({ key, label }) => {
                    const text =
                        key === 'A'
                            ? question.optionA
                            : key === 'B'
                            ? question.optionB
                            : key === 'C'
                            ? question.optionC
                            : question.optionD;
                    const isSelected = selected === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            disabled={disabled || isSelected}
                            onClick={() => onSelect(key)}
                            className={`flex items-start gap-3 rounded-md border p-3 text-left transition hover:bg-muted/40 disabled:opacity-60 ${
                                isSelected ? 'border-primary bg-primary/10' : ''
                            }`}
                        >
                            <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                {label}
                            </span>
                            <span className="flex-1 text-sm">{text}</span>
                        </button>
                    );
                })}
            </div>
            {question.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {question.tags.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5">
                            {t}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}