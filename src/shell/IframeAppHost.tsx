import React, { useLayoutEffect, useRef, useState } from 'react';

interface IframeAppHostProps {
  title: string;
  src: string;
  reloadToken?: number;
}

function teardownIframeDocument(iframe: HTMLIFrameElement): void {
  try {
    const win = iframe.contentWindow as
      | (Window & {
          RG?: {
            game?: {
              state?: string;
              audio?: {
                stopSpeech?: () => void;
                ctx?: AudioContext | null;
              };
            };
          };
        })
      | null;
    if (win) {
      if (win.RG?.game) {
        win.RG.game.state = 'menu';
        win.RG.game.audio?.stopSpeech?.();
        const audioCtx = win.RG.game.audio?.ctx;
        if (audioCtx && audioCtx.state !== 'closed') {
          void audioCtx.close().catch(() => {});
        }
      }
      if ('speechSynthesis' in win) {
        win.speechSynthesis.cancel();
      }
    }
  } catch {
    // Ignore errors when iframe is already detached
  }

  try {
    iframe.src = 'about:blank';
  } catch {
    // Ignore navigation reset failure during teardown
  }
}

export const IframeAppHost: React.FC<IframeAppHostProps> = ({
  title,
  src,
  reloadToken = 0,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    setLoaded(false);
    const iframe = iframeRef.current;
    return () => {
      if (iframe) {
        teardownIframeDocument(iframe);
      }
    };
  }, [src, reloadToken]);

  const handleLoad = () => {
    setLoaded(true);
    try {
      iframeRef.current?.focus();
      iframeRef.current?.contentWindow?.focus();
    } catch {
      // Ignore focus restriction
    }
  };

  return (
    <div className="relative w-full h-full bg-[#05070a] overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#090b0e] pointer-events-none">
          <div className="text-center space-y-2">
            <div className="text-xs font-mono-num uppercase tracking-widest text-cyan-400">
              INITIALIZING SANDBOX
            </div>
            <div className="font-display text-2xl font-bold text-slate-100">{title}</div>
          </div>
        </div>
      )}
      <iframe
        key={`${src}::${reloadToken}`}
        ref={iframeRef}
        src={src}
        title={title}
        data-testid="sandbox-app-iframe"
        onLoad={handleLoad}
        className="w-full h-full border-0 block bg-[#05070a]"
        allow="autoplay; fullscreen; gamepad"
      />
    </div>
  );
};
