// The IR in a share link (?irz= compressed, or the legacy ?ir= base64url), and making one.
import { useCallback, useEffect, useState } from "react";
import { base64UrlToBytes, bytesToBase64Url, compressIr, decompressIr, isCompressionSupported } from "../share/irCompress.ts";

const PARAM_COMPRESSED = "irz";
const PARAM_PLAIN = "ir";

export interface SharedIr {
  ir: string;
  setIr(ir: string): void;
  fromLink: boolean; // the page was opened from a share link
  decoding: boolean; // a compressed link is still being decoded
  shareUrl(): Promise<string>;
}

export function useSharedIr(defaultIr: string): SharedIr {
  const [initial] = useState(() => readParams(window.location.search));
  const [ir, setIr] = useState(initial.plain ?? defaultIr);
  const [decoding, setDecoding] = useState(initial.compressed !== null);

  useEffect(() => {
    if (initial.compressed === null) return;
    let cancelled = false;
    decompressIr(initial.compressed)
      .then((decoded) => !cancelled && setIr(decoded))
      .catch((err) => console.warn("cannot decode the shared IR", err))
      .finally(() => !cancelled && setDecoding(false));
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const shareUrl = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM_COMPRESSED);
    url.searchParams.delete(PARAM_PLAIN);
    if (isCompressionSupported()) url.searchParams.set(PARAM_COMPRESSED, await compressIr(ir));
    else url.searchParams.set(PARAM_PLAIN, bytesToBase64Url(new TextEncoder().encode(ir)));
    return url.toString();
  }, [ir]);

  return { ir, setIr, fromLink: initial.compressed !== null || initial.plain !== null, decoding, shareUrl };
}

function readParams(search: string): { compressed: string | null; plain: string | null } {
  const params = new URLSearchParams(search);
  const compressed = params.get(PARAM_COMPRESSED);
  const plain = params.get(PARAM_PLAIN);
  let decodedPlain: string | null = null;
  if (compressed === null && plain !== null) {
    try {
      decodedPlain = new TextDecoder().decode(base64UrlToBytes(plain));
    } catch {
      console.warn("cannot decode the shared IR");
    }
  }
  return { compressed, plain: decodedPlain };
}
