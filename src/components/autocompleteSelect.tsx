import { useMemo, useState } from "react";

interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

function getFuzzyScore(label: string, query: string): number {
  const normalizedLabel = label.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return 0;

  let score = 0;
  let fromIndex = 0;
  let lastMatchIndex = -2;

  for (const char of normalizedQuery) {
    const matchIndex = normalizedLabel.indexOf(char, fromIndex);
    if (matchIndex < 0) return -1;

    score += 1;
    if (matchIndex === 0 || normalizedLabel[matchIndex - 1] === " ") score += 2;
    if (matchIndex === lastMatchIndex + 1) score += 3;

    lastMatchIndex = matchIndex;
    fromIndex = matchIndex + 1;
  }

  return score;
}

export default function AutocompleteSelect<T extends string | number>({
  id,
  value,
  options,
  placeholder,
  disabled = false,
  className = "",
  onChange,
}: {
  id?: string;
  value: T | null;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: T) => void;
}) {
  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedLabel = selectedOption?.label ?? "";

  const filteredOptions = useMemo(() => {
    const trimmedQuery = query.trim();
    return options
      .map((option) => ({ option, score: getFuzzyScore(option.label, trimmedQuery) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label))
      .map((entry) => entry.option);
  }, [options, query]);

  const selectOption = (option: SelectOption<T>) => {
    onChange(option.value);
    setQuery("");
    setIsOpen(false);
    setActiveIndex(0);
  };

  const restoreSelected = () => {
    setQuery("");
    setIsOpen(false);
    setActiveIndex(0);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        value={isOpen ? query : selectedLabel}
        disabled={disabled}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => {
          setQuery(selectedLabel);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onBlur={restoreSelected}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setIsOpen(true);
            return;
          }

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => Math.min(prev + 1, Math.max(filteredOptions.length - 1, 0)));
            return;
          }

          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
            return;
          }

          if (e.key === "Enter") {
            e.preventDefault();
            if (filteredOptions[activeIndex]) {
              selectOption(filteredOptions[activeIndex]);
            } else {
              restoreSelected();
            }
            return;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            restoreSelected();
          }
        }}
        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />

      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {filteredOptions.map((option, index) => (
            <li key={String(option.value)}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(option);
                }}
                className={`w-full px-3 py-2 text-left text-sm ${
                  index === activeIndex
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-zinc-100 hover:bg-zinc-800"
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
