import { AppWindow, Building2, Headset, Landmark, RadioTower, Truck } from "lucide-react";
import { INDUSTRIES } from "./content";

const ICONS = [RadioTower, Landmark, AppWindow, Headset, Building2, Truck];

export function Industries() {
  return (
    <section id="industries" className="section on-light" data-tone="light" aria-labelledby="industries-title" tabIndex={-1}>
      <div className="wrap">
        <div className="section-head" data-reveal>
          <h2 id="industries-title" className="t-h2">
            Who we work with
          </h2>
          <p className="t-lead muted">Networks and businesses that need their calls, messages and data to arrive.</p>
        </div>
        <ul className="industries-grid">
          {INDUSTRIES.map((x, i) => {
            const Icon = ICONS[i % ICONS.length]!;
            return (
              <li key={x.name} className="industry">
                <Icon aria-hidden="true" />
                <h3 className="t-h3">{x.name}</h3>
                <p className="muted">{x.line}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
