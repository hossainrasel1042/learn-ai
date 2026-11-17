"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import { useDebounce } from "@/hooks/use-debounce";

interface TagInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    suggestions?: string[];
    onSearch?: (query: string) => void;

    id?: string;

    ariaLabel?: string;
}

export function TagInput({
    value,
    onChange,
    placeholder = "Add tag...",
    suggestions = [],
    onSearch,
    id,
    ariaLabel,
}: TagInputProps) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = React.useState("");
    const [open, setOpen] = React.useState(false);


    const debouncedInputValue = useDebounce(inputValue, 300);






    const onSearchRef = React.useRef(onSearch);
    React.useEffect(() => {
        onSearchRef.current = onSearch;
    }, [onSearch]);


    const prevDebouncedValue = React.useRef<string>("");

    React.useEffect(() => {

        const search = onSearchRef.current;
        if (search && debouncedInputValue !== prevDebouncedValue.current) {
            prevDebouncedValue.current = debouncedInputValue;
            search(debouncedInputValue);
        }
    }, [debouncedInputValue]);



    const filteredSuggestions = onSearch
        ? suggestions.filter(s => !value.includes(s))
        : suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase()));

    const handleUnselect = (tag: string) => {
        onChange(value.filter((s) => s !== tag));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const input = inputRef.current;
        if (input) {
            if (e.key === "Delete" || e.key === "Backspace") {
                if (input.value === "" && value.length > 0) {
                    handleUnselect(value[value.length - 1]);
                }
            }

            if (e.key === "Enter") {
                if (open && filteredSuggestions.length > 0) {
                    return;
                }

                if (inputValue.trim() !== "") {
                    e.preventDefault();
                    if (!value.includes(inputValue.trim())) {
                        onChange([...value, inputValue.trim()]);
                        setInputValue("");
                    }
                }
            }

            if (e.key === "Tab" && open && filteredSuggestions.length > 0) {
                e.preventDefault();
                selectSuggestion(filteredSuggestions[0]);
            }
        }
    };

    const selectSuggestion = (tag: string) => {
        if (!value.includes(tag)) {
            onChange([...value, tag]);
            setInputValue("");

            setOpen(false);
            setTimeout(() => {
                inputRef.current?.focus();
            }, 0);
        }
    }

    return (
        <Command onKeyDown={handleKeyDown} className="overflow-visible bg-transparent">
            <div
                className="group border border-input px-3 py-2 text-sm ring-offset-background rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
            >
                <div className="flex flex-wrap gap-1">
                    {value.map((tag) => (
                        <Badge key={tag} variant="secondary">
                            {tag}
                            <button
                                className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleUnselect(tag);
                                    }
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onClick={() => handleUnselect(tag)}
                            >
                                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </button>
                        </Badge>
                    ))}
                    <CommandPrimitive.Input
                        ref={inputRef}
                        id={id}
                        aria-label={ariaLabel}
                        value={inputValue}
                        onValueChange={setInputValue}
                        onBlur={(e) => {



                            const next = e.relatedTarget as HTMLElement | null;
                            if (next && next.closest('[data-suggestion]')) {
                                return;
                            }
                            setTimeout(() => setOpen(false), 200);
                        }}
                        onFocus={() => setOpen(true)}
                        placeholder={placeholder}
                        className="ml-2 bg-transparent outline-none placeholder:text-muted-foreground flex-1 min-w-[50px]"
                    />
                </div>
            </div>
            {open && filteredSuggestions.length > 0 && (
                <div className="relative mt-2">
                    <div className="absolute top-0 z-10 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
                        <CommandList>
                            <CommandGroup className="h-full overflow-auto">
                                {filteredSuggestions.map((suggestion) => (
                                    <CommandItem
                                        key={suggestion}
                                        data-suggestion
                                        onSelect={() => selectSuggestion(suggestion)}
                                        className="cursor-pointer"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                    >
                                        {suggestion}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </div>
                </div>
            )}
        </Command>
    );
}
