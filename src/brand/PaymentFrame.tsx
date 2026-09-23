import { useEffect, useRef } from "react";
type Frames = {
  modes: { TEST: string };
  init(options: {
    publicKey: string;
    selector: string;
    mode: string;
    onValidationUpdate: (data: { valid: boolean }) => void;
    onTokenized: (data: { token: string }) => void;
    onTokenizationFailed: () => void;
  }): void;
  submitPayment(): void;
};
declare const PaymenntJS: Frames;
let loading: Promise<void> | undefined;
function loadFrames() {
  loading ??= new Promise<void>((resolve, reject) => {
    // Tighten the SDK's message boundary to the exact TEST origin and frame.
    window.addEventListener("message", (event) => {
      if (
        event.data?.event &&
        ["Tokenized", "TokenizationFailed", "ValidationUpdate"].includes(
          event.data.event,
        )
      ) {
        const frame = document.querySelector<HTMLIFrameElement>(
          '[id="3l-card-frame"] iframe',
        );
        if (
          event.origin !== "https://pay.test.paymennt.com" ||
          event.source !== frame?.contentWindow
        )
          event.stopImmediatePropagation();
      }
    });
    const script = document.createElement("script");
    script.src = "https://pay.paymennt.com/static/js/paymennt-frames.js";
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(Error("Payment form unavailable. Please try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}
export function PaymentFrame(props: {
  publicKey: string;
  valid: (value: boolean) => void;
  token: (value: string) => void;
  failure: () => void;
  submitRef: { current: (() => void) | null };
}) {
  const current = useRef(props);
  useEffect(() => {
    current.current = props;
  });
  useEffect(() => {
    let active = true;
    const container = document.getElementById("3l-card-frame")!;
    void loadFrames()
      .then(() => {
        if (!active) return;
        PaymenntJS.init({
          publicKey: props.publicKey,
          selector: '[id="3l-card-frame"]',
          mode: PaymenntJS.modes.TEST,
          onValidationUpdate: (data) => {
            if (active) current.current.valid(data.valid === true);
          },
          onTokenized: (data) => {
            if (active) current.current.token(data.token);
          },
          onTokenizationFailed: () => {
            if (active) current.current.failure();
          },
        });
        const frame = container.querySelector("iframe");
        if (frame) frame.title = "Secure card details";
        current.current.submitRef.current = () => PaymenntJS.submitPayment();
      })
      .catch(() => {
        if (active) current.current.failure();
      });
    return () => {
      active = false;
      current.current.submitRef.current = null;
      container.replaceChildren();
    };
  }, [props.publicKey]);
  return <div id="3l-card-frame" style={{ height: 160, width: "100%" }} />;
}
