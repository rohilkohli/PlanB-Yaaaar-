import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { navigate } from '../router';

export const REPO_ISSUES = 'https://github.com/rohilkohli/PlanB-Yaaaar-/issues';
const GOOGLE_TOS = 'https://cloud.google.com/maps-platform/terms';
const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

/** Contact line: a real email when the operator has configured CONTACT_EMAIL, else the public issue tracker. */
export const ContactLine: React.FC = () => {
  const [email, setEmail] = React.useState<string | null>(null);
  React.useEffect(() => { fetch('/api/config').then(r => r.json()).then((j: { contactEmail?: string | null }) => setEmail(j.contactEmail ?? null)).catch(() => undefined); }, []);
  return email
    ? <>Contact: <a className="font-semibold text-spruce underline underline-offset-2" href={`mailto:${email}`}>{email}</a>.</>
    : <>Contact: open an issue at <a className="font-semibold text-spruce underline underline-offset-2" href={REPO_ISSUES} target="_blank" rel="noopener noreferrer">github.com/rohilkohli/PlanB-Yaaaar-/issues</a>.</>;
};
const UPDATED = '16 November 2026';

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => <h2 className="font-bold text-base text-obsidian mt-6 mb-1.5">{children}</h2>;
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-olive-slate leading-relaxed mb-2">{children}</p>;
const L: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-5 text-sm text-olive-slate leading-relaxed space-y-1 mb-2">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
);
const A: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-spruce underline underline-offset-2">{children}</a>
);

export const DataSourcesLink: React.FC<{ className?: string }> = ({ className = 'underline font-semibold' }) => (
  <a href="/data-sources" onClick={e => { e.preventDefault(); navigate('/data-sources'); }} className={className}>Data sources</a>
);

const Shell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <main className="flex-1 px-5 pt-3 pb-36">
    <header className="sticky top-0 -mx-5 px-5 py-2 bg-canvas/85 backdrop-blur-2xl border-b border-card-border/70 z-20 flex items-center gap-2 mb-4">
      <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/'))} aria-label="Go back"
        className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-obsidian hover:bg-white/70 active:scale-95"><ArrowLeft className="w-5 h-5" /></button>
      <span className="font-extrabold text-lg text-obsidian tracking-tight">PlanB</span>
    </header>
    <h1 className="font-extrabold text-2xl text-obsidian tracking-tight">{title}</h1>
    <p className="text-xs text-olive-slate mt-0.5 mb-3">Last updated {UPDATED}</p>
    {children}
    <nav aria-label="Legal" className="mt-8 flex flex-wrap gap-x-4 text-sm"><LegalLinks /></nav>
  </main>
);

export const LegalLinks: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex flex-wrap items-center gap-x-1 ${className}`}>
    {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Data sources', '/data-sources']].map(([label, to], i) => (
      <React.Fragment key={to}>
        {i > 0 && <span aria-hidden="true" className="text-card-border">·</span>}
        <a href={to} onClick={e => { e.preventDefault(); navigate(to); }} className="min-h-[44px] inline-flex items-center px-1.5 font-semibold text-spruce underline underline-offset-2">{label}</a>
      </React.Fragment>
    ))}
  </span>
);

export const PrivacyPage: React.FC = () => (
  <Shell title="Privacy">
    <P>PlanB needs no account, name, email or password. This page explains what is stored, what is sent where, and how to delete it.</P>

    <H>On your device</H>
    <L items={[
      'Your current day plan, your preferences (walking limits, dietary, evening comfort, units) and a few counters are saved in your browser (IndexedDB / localStorage) so the app works offline.',
      'They are deleted automatically after 14 days, or immediately with “Reset & delete all my data” in Preferences.',
      'Venues you flag as “closed” are remembered only for the current browser session.'
    ]} />

    <H>Location</H>
    <P>Saved plans keep only what is ours (times, order, your choices) and each stop’s Google place ID and coordinates, which Google’s rules allow. Names, addresses, ratings and hours from Google are fetched again when you open the plan online and are not stored. Your location is used only when you tap “Use my location” or tick the location box when adapting your day. It is read once, not tracked in the background, and not saved on our servers. Coordinates are sent to our server and to Google to find nearby places, and are rounded to roughly city level in our logs.</P>

    <H>What our server receives</H>
    <L items={[
      'The choices you make: city or area, day, start and finish times, energy, budget, evening comfort, social appetite, walking and dietary preferences, and the optional note (up to 140 characters) you type when adapting.',
      'Your IP address, used briefly to apply fair-use limits. It is turned into a one-way hash that changes daily and is not written to our logs.',
      'Anonymous usage events such as “plan generated” or “stop swapped”, with the settings used. They carry no identifier, so we cannot tell who sent them or link them together.',
      'Standard technical logs (time, request type, error codes, response time) kept by Google Cloud for operations and debugging.'
    ]} />

    <H>Services that receive some of this</H>
    <L items={[
      <>Google Maps Platform (Places, Geocoding, Time Zone, Weather) receives the places or coordinates we look up, from our server’s address, not from your device. See <A href="https://policies.google.com/privacy">Google’s privacy policy</A>.</>,
      'Anthropic, when AI sequencing is switched on, receives the city, your settings and preferences, a list of candidate venues and, if you typed one, your short note, in order to suggest and explain stops. It does not receive your IP address or location. If AI sequencing is off, no data goes to Anthropic.',
      'Open-Meteo may receive approximate coordinates (rounded to about 1 km) for the weather when Google’s weather service is unavailable.',
      'Google Fonts and image hosts (for example Unsplash) see your IP address when your device loads fonts and photos.',
      'Hosting is on Google Cloud Run in Mumbai (asia-south1).'
    ]} />

    <H>Your choices</H>
    <L items={[
      'Delete everything on your device: Preferences → Reset & delete all my data.',
      'Use the app without sharing location: type a city instead.',
      'Because we hold no account or identifier for you, there is no profile on our side to access or delete. If you believe we hold something about you, tell us (below) and we will look.'
    ]} />

    <H>Why we collect this (purposes)</H>
    <L items={[
      'Build and adjust your day plan: your choices, optional note, and location if you share it.',
      'Keep the service working and fair: your IP address (hashed daily) for limits, and technical logs.',
      'Improve the product: anonymous usage events that cannot be linked to you.'
    ]} />

    <H>Children</H>
    <P>PlanB is not intended for people under 18.</P>

    <H>Changes and contact</H>
    <P>If this changes materially we will update this page and its date. Questions or requests: <ContactLine /></P>
  </Shell>
);

export const TermsPage: React.FC = () => (
  <Shell title="Terms of use">
    <P>By using PlanB you agree to these terms. They are short on purpose.</P>

    <H>What PlanB is</H>
    <P>A planning aid. It suggests a paced day and reshapes it when your day changes. It is not a guide, a safety service or a booking service.</P>

    <H>Google Maps</H>
    <P>PlanB uses <span translate="no" className="notranslate">Google Maps</span> Platform. By using it you are also bound by the <A href={GOOGLE_TOS}>Google Maps Platform Terms of Service</A> and the <A href={GOOGLE_PRIVACY}>Google Privacy Policy</A>.</P>

    <H>Your judgment comes first</H>
    <P>Street conditions, opening hours, weather and safety change constantly. Suggestions, evening-area choices and daylight cut-offs, and opening hours may be wrong or out of date. Check a venue is open and the area feels comfortable before you go, and change plans whenever something feels off. Nothing in the app is advice about your personal safety. In an emergency, contact local emergency services.</P>

    <H>Information from others</H>
    <P>Place details, ratings, reviews and weather come from third parties (see <DataSourcesLink className="font-semibold text-spruce underline underline-offset-2" />). We do not verify them and are not responsible for them. Links to Google Maps and other sites are governed by those sites’ terms.</P>

    <H>Fair use</H>
    <L items={[
      'Do not scrape, overload, probe or try to bypass the limits of the service, or use it to build a competing data set.',
      'Do not use it for anything unlawful.',
      'We may limit or block use that puts the service or its data providers at risk.'
    ]} />

    <H>No warranty, limited liability</H>
    <P>PlanB is provided “as is” and “as available”, without promises that it will be accurate, uninterrupted or suitable for your trip. To the extent the law allows, we are not liable for loss, injury or inconvenience arising from using it or relying on its suggestions. Nothing here limits rights you cannot lawfully give up.</P>

    <H>Changes and contact</H>
    <P>We may change the service or these terms; continuing to use PlanB after a change means you accept it. <ContactLine /></P>
  </Shell>
);

export const DataSourcesPage: React.FC = () => (
  <Shell title="Data sources">
    <P>Where the information in PlanB comes from, and how much to trust it.</P>

    <H>Google Maps</H>
    <P>When live data is on, place names, addresses, locations, ratings, review counts, opening hours, reviews and weather come from <A href="https://mapsplatform.google.com/">Google Maps Platform</A>. Those venues are labelled “Verified via Google Places”. Opening hours are a recurring weekly schedule: holidays and one-off closures may not appear. Reviews belong to their authors and are shown with their names.</P>

    <H>Curated listings</H>
    <P>When live data is unavailable, PlanB uses a small hand-written list of venues. These are labelled “Curated listing” and their hours are approximate. Confirm in Maps before you go.</P>

    <H>Weather</H>
    <P>Current conditions come from the Google Maps Platform Weather API. If that is unavailable, weather data is provided by <A href="https://open-meteo.com/">Open-Meteo.com</A> under <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>.</P>

    <H>Sunset and daylight</H>
    <P>Sunset is calculated on the device and server from the location and date using the NOAA solar-position method. It is accurate to a few minutes and does not account for terrain or cloud.</P>

    <H>Photos</H>
    <P>Curated listings use photos from Unsplash and Google-hosted images. Venues from live data may have no photo.</P>

    <H>How plans are made</H>
    <P>Venues come from the sources above. A rule-based planner enforces opening hours, daylight cut-offs, walking limits and your preferences. When AI sequencing is on, an AI model may only choose and order venues from that verified list and write the short explanations. It cannot add venues or change times.</P>
  </Shell>
);
