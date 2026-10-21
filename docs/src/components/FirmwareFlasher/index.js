import React, { useEffect, useState } from 'react';

import { IMAGE_EXTENSION, TEXT, buildFlashManifest, sha256Hex, versionOfImage, webSerialSupported } from './flasher';

/**
 * The browser flasher of the ESP32-S3 (REL-024). It renders the safety text and the fallback on the server and before the
 * browser is known; in a browser with Web Serial it asks for the release image, shows its SHA-256 and hands the image to
 * ESP Web Tools, which writes it only when the person presses Install and picks the port. The release assets of GitHub
 * carry no CORS headers, so the page cannot download the image for the person: the person downloads and checks it.
 */
export default function FirmwareFlasher({ lang = 'en' }) {
  const text = TEXT[lang];
  const [supported, setSupported] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    const ok = webSerialSupported(typeof navigator === 'undefined' ? undefined : navigator);
    setSupported(ok);
    // The element is registered by the library, which runs only in a browser that can use it.
    if (ok) void import('esp-web-tools/dist/web/install-button.js');
  }, []);

  useEffect(
    () => () => {
      if (chosen) URL.revokeObjectURL(chosen.manifestUrl);
    },
    [chosen],
  );

  async function onFile(file) {
    setChosen(null);
    setWrong(false);
    const version = file === undefined ? undefined : versionOfImage(file.name);
    if (file === undefined || version === undefined) {
      setWrong(file !== undefined);
      return;
    }
    const bytes = await file.arrayBuffer();
    const imageUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const manifest = buildFlashManifest({ version, imageUrl });
    const manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
    setChosen({ name: file.name, version, sha256: await sha256Hex(bytes), manifestUrl });
  }

  return (
    <section className="firmware-flasher" aria-label={text.title}>
      <p>
        <strong>{text.safety}</strong>
      </p>
      {supported === true ? (
        <>
          <p>{text.steps}</p>
          <label>
            {text.choose} <input type="file" accept={`.${IMAGE_EXTENSION}`} onChange={(event) => void onFile(event.target.files?.[0])} />
          </label>
          {wrong && <p role="alert">{text.wrongFile}</p>}
          {chosen && (
            <>
              <p>
                {text.checksum} <code>{chosen.sha256}</code>
              </p>
              {React.createElement(
                'esp-web-install-button',
                { manifest: chosen.manifestUrl },
                <button slot="activate" type="button" className="button button--primary">
                  {text.install}
                </button>,
                <span slot="unsupported">{text.unsupported}</span>,
                <span slot="not-allowed">{text.notAllowed}</span>,
              )}
            </>
          )}
        </>
      ) : (
        <p>{supported === null ? text.checking : text.unsupported}</p>
      )}
    </section>
  );
}
