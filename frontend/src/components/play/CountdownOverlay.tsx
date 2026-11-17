'use client';



import { useEffect, useState } from 'react';

interface CountdownOverlayProps {

    seconds: number;

    onComplete?: () => void;
}

export function CountdownOverlay({ seconds, onComplete }: CountdownOverlayProps) {
    const [count, setCount] = useState(seconds);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (done) return;
        if (count <= 0) {


            Promise.resolve().then(() => {
                setDone(true);
                onComplete?.();
            });
            return;
        }
        const t = setTimeout(() => setCount((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [count, done, onComplete]);

    if (done) return null;

    return (
        <div
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-sm"
            role="timer"
            aria-live="polite"
        >
            <style>{`
                @keyframes battle-countdown-pop {
                    0%   { transform: scale(0.6); opacity: 0; }
                    20%  { transform: scale(1.1); opacity: 1; }
                    80%  { transform: scale(1.0); opacity: 1; }
                    100% { transform: scale(0.95); opacity: 0; }
                }
                .animate-battle-countdown {
                    animation: battle-countdown-pop 1s ease-out forwards;
                }
            `}</style>
            <div
                key={count}
                className="animate-battle-countdown text-primary"
                style={{
                    fontSize: 'clamp(80px, 18vw, 220px)',
                    fontWeight: 800,
                    lineHeight: 1,
                    textShadow: '0 4px 24px rgba(0,0,0,0.25)',
                }}
            >
                {count}
            </div>
        </div>
    );
}

export default CountdownOverlay;