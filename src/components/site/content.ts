// Every word and claim on the public website lives here, so it can be checked in one place.
// PRD v3 §5 rule: no unverified claims. Figures, partner logos, uptime and testimonials are
// deliberately absent until Figuraid confirms them; add them here only when they are true.

export type ServiceKey = "voice" | "messaging" | "numbers" | "connectivity";

export interface Offering {
  name: string;
  detail: string;
}

export interface ServiceGroup {
  key: ServiceKey;
  name: string;
  line: string;
  offerings: Offering[];
}

export const SERVICES: ServiceGroup[] = [
  {
    key: "voice",
    name: "Voice",
    line: "Wholesale termination and SIP trunking with clear routes, quality you can measure, and billing you can audit.",
    offerings: [
      { name: "Wholesale VoIP termination", detail: "CLI and non-CLI routes, priced per destination, with daily rate updates." },
      { name: "SIP trunking", detail: "Interconnect over SIP with the capacity and codecs your platform needs." },
      { name: "Route quality reporting", detail: "ASR and ACD per destination, so you can see how your traffic performs." },
    ],
  },
  {
    key: "messaging",
    name: "Messaging",
    line: "Application-to-person messaging that arrives: one-time passwords, alerts and campaigns.",
    offerings: [
      { name: "A2P SMS", detail: "Transactional and promotional SMS through direct and partner routes." },
      { name: "OTP delivery", detail: "Verification codes built for speed, with delivery reports on every message." },
      { name: "Short codes", detail: "Dedicated and shared short codes for two-way campaigns." },
    ],
  },
  {
    key: "numbers",
    name: "Numbers and APIs",
    line: "Local numbers, number intelligence and programmable APIs to build calling and messaging into your product.",
    offerings: [
      { name: "DIDs", detail: "Local and toll-free numbers for inbound voice and messaging." },
      { name: "Number analytics", detail: "Validate numbers and look up carrier and line type before you send." },
      { name: "Programmable APIs", detail: "Send, receive and route from your own code." },
    ],
  },
  {
    key: "connectivity",
    name: "Connectivity",
    line: "The layer underneath: mobile data, IoT, signalling and the infrastructure to run a network.",
    offerings: [
      { name: "Mobile data and IoT", detail: "Connectivity for devices and fleets across borders." },
      { name: "Signalling", detail: "Signalling services for operators and service providers." },
      { name: "Network and colocation", detail: "Interconnect, transit and space for your equipment." },
      { name: "MVNO and MVNE", detail: "The enablement to launch and run a mobile brand." },
    ],
  },
];

/** Services offered through the request form. TDM is available on request only (PRD v3 §5 rules). */
export const REQUESTABLE = [
  ...SERVICES.flatMap((g) => g.offerings.filter((o) => o.name !== "Route quality reporting").map((o) => o.name)),
  "TDM voice (on request)",
  "Procurement",
  "Something else",
];

export type RegionKey = "americas" | "europe" | "africa" | "middleEast" | "asiaPacific";

// TO CONFIRM with the telecom team: which service groups are live in each region.
// Shown as capabilities, never as counts, until figures are verified.
export const REGIONS: { key: RegionKey; name: string; services: ServiceKey[] }[] = [
  { key: "africa", name: "Africa", services: ["voice", "messaging", "numbers", "connectivity"] },
  { key: "europe", name: "Europe", services: ["voice", "messaging", "numbers"] },
  { key: "middleEast", name: "Middle East", services: ["voice", "messaging"] },
  { key: "asiaPacific", name: "Asia Pacific", services: ["voice", "messaging"] },
  { key: "americas", name: "Americas", services: ["voice", "messaging", "numbers"] },
];

export const INDUSTRIES = [
  { name: "Carriers and operators", line: "Termination, transit and interconnect between networks." },
  { name: "Banks and fintech", line: "One-time passwords and alerts that reach customers in seconds." },
  { name: "Apps and platforms", line: "Messaging and numbers built into your product through our APIs." },
  { name: "Contact centres", line: "Outbound and inbound voice capacity with local numbers." },
  { name: "Enterprises", line: "Business messaging, SIP trunks and connectivity under one contract." },
  { name: "IoT and logistics", line: "Data connectivity for devices that move across borders." },
];

/** Insights section renders only when this has real posts. */
export const INSIGHTS: { title: string; date: string; href: string; summary: string }[] = [];

export const COMPANY = {
  name: "Figuraid Ltd",
  address: ["Kano House", "72 Ralph Shodeinde Street", "Central Business District, Abuja"],
  // Social profiles are left out until official Figuraid accounts are confirmed (PRD v3 §5: fix links pointing to FigureWeb).
  social: [] as { name: string; href: string }[],
};

export const OTHER_BUSINESSES = [
  { name: "Figure Academy", line: "Technology training and certification", href: "https://figuracademy.org" },
  { name: "FigureWeb", line: "Hosting, domains and business email", href: "https://figureweb.ng" },
  { name: "Procurement", line: "Sourcing and supply for organisations", href: "/request?service=procurement" },
];
