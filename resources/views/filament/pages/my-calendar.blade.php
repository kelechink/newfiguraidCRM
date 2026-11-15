<x-filament-panels::page>
<x-filament::section heading="Add Figuraid to Google Calendar">
  <ol style="display:grid;gap:8px;list-style:decimal;padding-left:20px">
    <li>Copy your private link: <input readonly value="{{ $feed }}" style="width:100%;margin-top:6px;border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:8px" onclick="this.select()"></li>
    <li>In Google Calendar on a computer: <strong>Other calendars → + → From URL</strong>, paste the link, <strong>Add calendar</strong>. (Outlook: Add calendar → Subscribe from web.)</li>
    <li>Your tasks with due times, bookings, approved leave, renewals and expiring documents you own will appear and refresh every few hours.</li>
  </ol>
  <p style="margin-top:10px;opacity:.7">Keep the link private. If it leaks, reset it — the old link stops working.</p>
  <div style="margin-top:10px"><x-filament::button color="gray" size="sm" wire:click="reset_" wire:confirm="Reset your calendar link?">Reset link</x-filament::button></div>
</x-filament::section>
<x-filament::section heading="Your booking link">
  <p>Send this to customers so they can book a 30-minute call with you. They get a calendar invitation by email.</p>
  <input readonly value="{{ $booking }}" style="width:100%;margin-top:6px;border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:8px" onclick="this.select()">
</x-filament::section>
</x-filament-panels::page>
