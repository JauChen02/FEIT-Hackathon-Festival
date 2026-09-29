'use client';

import { useState } from 'react';
import type { ServedQuestionPayload } from '@learnarena/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * One question, one at a time (PLANNING.md §20 screen 5, §8.1).
 *
 * Presentational (ADR-021): it renders what the server served and hands the
 * learner's response back up. It has no idea which option is correct — the
 * payload does not contain that (Invariant 1).
 */

export interface QuizQuestionProps {
  question: ServedQuestionPayload;
  disabled: boolean;
  onSubmit: (response: { optionId: string } | { value: string }) => void;
}

export function QuizQuestion({ question, disabled, onSubmit }: QuizQuestionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [value, setValue] = useState('');

  if (question.type === 'MCQ') {
    return (
      <div className="flex flex-col gap-4">
        <p data-testid="question-prompt" className="text-lg">
          {question.prompt}
        </p>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Answer options">
          {(question.options ?? []).map((option) => (
            <Button
              key={option.id}
              type="button"
              variant={selected === option.id ? 'default' : 'outline'}
              role="radio"
              aria-checked={selected === option.id}
              data-testid={`option-${option.id}`}
              disabled={disabled}
              className="h-auto justify-start py-3 text-left whitespace-normal"
              onClick={() => setSelected(option.id)}
            >
              {option.text}
            </Button>
          ))}
        </div>

        <Button
          type="button"
          disabled={disabled || selected === null}
          data-testid="submit-answer"
          onClick={() => selected && onSubmit({ optionId: selected })}
        >
          Submit
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() !== '') onSubmit({ value });
      }}
    >
      <p data-testid="question-prompt" className="text-lg">
        {question.prompt}
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="numeric-answer">Your answer</Label>
        <Input
          id="numeric-answer"
          data-testid="numeric-answer"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={disabled || value.trim() === ''} data-testid="submit-answer">
        Submit
      </Button>
    </form>
  );
}
