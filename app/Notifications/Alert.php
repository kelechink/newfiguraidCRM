<?php

namespace App\Notifications;

use Filament\Notifications\Notification as FilamentNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** One notification type for the notification centre (in-app + email outside quiet hours). */
class Alert extends Notification
{
    use Queueable;

    public function __construct(public string $title, public string $body, public ?string $url = null, public bool $email = false) {}

    public function via(object $notifiable): array
    {
        $quiet = $notifiable->quiet_hours ?? null; // ["22:00","07:00"]
        $now = now('Africa/Lagos')->format('H:i');
        $inQuiet = $quiet && count($quiet) === 2 && ($quiet[0] > $quiet[1] ? ($now >= $quiet[0] || $now < $quiet[1]) : ($now >= $quiet[0] && $now < $quiet[1]));

        return $this->email && ! $inQuiet ? ['database', 'mail'] : ['database'];
    }

    public function toDatabase(object $notifiable): array
    {
        $n = FilamentNotification::make()->title($this->title)->body($this->body);
        if ($this->url) {
            $n->actions([\Filament\Actions\Action::make('open')->url($this->url)->markAsRead()]);
        }

        return $n->getDatabaseMessage();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $m = (new MailMessage)->subject($this->title)->line($this->body);

        return $this->url ? $m->action('Open', url($this->url)) : $m;
    }
}
