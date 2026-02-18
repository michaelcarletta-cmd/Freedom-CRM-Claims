export type CarrierDismantlerPayload = unknown;

export type DarwinDismantlerEventDetail = {
  claimId: string;
  analysisType: string;
  carrierDismantler: CarrierDismantlerPayload;
};

const EVENT_NAME = "darwin:carrierDismantler";

export function publishCarrierDismantler(detail: DarwinDismantlerEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DarwinDismantlerEventDetail>(EVENT_NAME, { detail }));
}

export function subscribeCarrierDismantler(
  handler: (detail: DarwinDismantlerEventDetail) => void,
) {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const ce = e as CustomEvent<DarwinDismantlerEventDetail>;
    if (ce?.detail) handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

