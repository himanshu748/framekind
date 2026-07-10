import { ImagePlus, LockKeyhole, Upload } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

interface HeroProps {
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onSample: () => void;
}

export function Hero({ inputRef, disabled, onFile, onSample }: HeroProps) {
  return (
    <section className="hero" aria-labelledby="page-title">
      <div>
        <h1 id="page-title">Describe what matters.</h1>
        <p>Draft useful alt text locally. Your image never leaves this device.</p>
        <div className="hero-actions">
          <button className="button button-primary" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
            <Upload aria-hidden="true" />
            Choose image
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled}
            onChange={onFile}
          />
          <button className="button button-secondary" type="button" disabled={disabled} onClick={onSample}>
            <ImagePlus aria-hidden="true" />
            Try sample
          </button>
        </div>
      </div>
      <p className="privacy-note">
        <LockKeyhole aria-hidden="true" />
        Processing stays on this device
      </p>
    </section>
  );
}
