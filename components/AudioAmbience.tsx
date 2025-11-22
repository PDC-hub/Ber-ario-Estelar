
import React, { useEffect, useRef } from 'react';

interface AudioAmbienceProps {
    isPlaying: boolean;
}

export const AudioAmbience: React.FC<AudioAmbienceProps> = ({ isPlaying }) => {
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const lfoRef = useRef<OscillatorNode | null>(null);

    useEffect(() => {
        const initAudio = async () => {
            if (isPlaying) {
                if (!audioCtxRef.current) {
                    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }
                
                const ctx = audioCtxRef.current;
                
                // Browser autoplay policy fix: resume if suspended
                if (ctx.state === 'suspended') {
                    try {
                        await ctx.resume();
                    } catch (e) {
                        console.warn("Audio resume failed. Interaction needed.");
                    }
                }

                // Prevent double-start
                if (oscRef.current) return;

                // Master Gain
                const masterGain = ctx.createGain();
                masterGain.gain.value = 0.15; 
                masterGain.connect(ctx.destination);

                // Drone Oscillator
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = 55.0; // A1
                
                // LFO
                const lfo = ctx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.value = 0.1; 
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = 2.0; 
                
                lfo.connect(lfoGain);
                lfoGain.connect(osc.frequency); 
                
                // Reverb/Delay
                const delay = ctx.createDelay();
                delay.delayTime.value = 0.5;
                const feedback = ctx.createGain();
                feedback.gain.value = 0.4;
                
                osc.connect(masterGain);
                osc.connect(delay);
                delay.connect(feedback);
                feedback.connect(delay);
                delay.connect(masterGain);

                osc.start();
                lfo.start();
                
                oscRef.current = osc;
                lfoRef.current = lfo;

            } else {
                // Stop logic
                if (oscRef.current) {
                    try {
                        oscRef.current.stop();
                        oscRef.current.disconnect();
                    } catch (e) {}
                    oscRef.current = null;
                }
                if (lfoRef.current) {
                    try {
                        lfoRef.current.stop();
                    } catch (e) {}
                    lfoRef.current = null;
                }
                // We do not close the context, just stop oscillators to allow restart
            }
        };

        initAudio();

        return () => {
            // Cleanup on unmount
             if (oscRef.current) {
                try { oscRef.current.stop(); } catch(e) {}
                oscRef.current = null;
             }
        };
    }, [isPlaying]);

    return null;
};
