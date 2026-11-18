export type Service = "adopt" | "surrender";
export type FailureReason = "invalid_uuid" | "already_available" | "none_available" | "unavailable";
type FarmEvent =
  | ["service_requested", { service: Service }]
  | ["service_failed", { service: Service; failure_reason: FailureReason }]
  | ["screen_opened", { screen_name: Service | "documentation" }]
  | ["adoption_completed" | "surrender_completed" | "uuid_copied"];
type Track = (...event: FarmEvent) => void;

interface AnalyticsConfig {
  measurementId: string;
  hostname?: string;
}

declare global {
  interface Window {
    uuidFarmAnalytics?: AnalyticsConfig;
    dataLayer?: IArguments[];
  }
}

export function analyticsMode(
  config: AnalyticsConfig | undefined,
  hostname: string,
  production: boolean,
  debug: boolean,
) {
  if (!config || !/^G-[A-Z0-9]+$/.test(config.measurementId)) return "off";
  if (!production) return debug ? "debug" : "off";
  return hostname && hostname === config.hostname ? "live" : "off";
}

// Google tag consumes Arguments objects from its queue, including commands
// recorded before the asynchronous script has loaded.
function gtag(..._command: unknown[]) {
  (window.dataLayer ??= []).push(arguments);
}

export function initializeAnalytics(): Track {
  const debug = import.meta.env.DEV && import.meta.env.VITE_ANALYTICS_DEBUG === "true";
  const config = debug
    ? { measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID }
    : window.uuidFarmAnalytics;
  const mode = analyticsMode(config, location.hostname, import.meta.env.PROD, debug);
  if (!config || mode === "off") return () => {};
  try {
    gtag("js", new Date());
    gtag("config", config.measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      // Only the landing page is tagged. Screen events describe navigation.
      page_location: location.origin + "/",
      page_referrer: document.referrer ? new URL(document.referrer).origin : "",
    });
    if (mode === "live") {
      const script = document.createElement("script");
      script.async = true;
      script.referrerPolicy = "origin";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`;
      document.head.appendChild(script);
    }
  } catch {
    return () => {};
  }
  return (...[event, parameters]: FarmEvent) => {
    try {
      gtag("event", event, { ...parameters, send_to: config.measurementId });
    } catch {
      // Browsers can block or replace the queue. Reception stays available.
    }
  };
}
