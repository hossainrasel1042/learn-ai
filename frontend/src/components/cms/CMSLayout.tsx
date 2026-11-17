"use client";

import * as React from "react";
import { CMSSidebar } from "./CMSSidebar";
import { SearchCommand } from "./SearchCommand";
import { Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

interface CMSLayoutProps {
    children: React.ReactNode;
    onNavigate?: (path: string) => void;
}

export function CMSLayout({ children, onNavigate }: CMSLayoutProps) {
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [sidebarOpen, setSidebarOpen] = React.useState(false);


    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setSearchOpen(true);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
        <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-background">
            
            <aside className="hidden w-64 flex-col md:flex">
                <CMSSidebar onNavigate={onNavigate} />
            </aside>

            
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden fixed top-[75px] left-3 z-40"
                        aria-label="Open navigation"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                    <SheetHeader className="sr-only">
                        <SheetTitle>Navigation</SheetTitle>
                    </SheetHeader>
                    <CMSSidebar
                        onNavigate={(path) => {
                            setSidebarOpen(false);
                            onNavigate?.(path);
                        }}
                    />
                </SheetContent>
            </Sheet>

            
            <div className="flex flex-1 flex-col overflow-hidden">
                
                <header className="flex h-14 items-center gap-4 border-b bg-muted/20 px-6 justify-between">
                    <div className="flex items-center gap-2">
                        <div className="font-semibold text-lg">LearnAI</div>
                    </div>

                    
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-64 justify-start text-muted-foreground"
                        onClick={() => setSearchOpen(true)}
                    >
                        <Search className="mr-2 h-4 w-4" />
                        <span>Search materials...</span>
                        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                            <span className="text-xs">⌘</span>K
                        </kbd>
                    </Button>
                </header>

                
                <main className="flex-1 overflow-y-auto p-6">
                    {children}
                </main>
            </div>

            
            <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
        </div>
    );
}

