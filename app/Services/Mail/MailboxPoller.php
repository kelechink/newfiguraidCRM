<?php

namespace App\Services\Mail;

use Illuminate\Support\Facades\Log;
use Webklex\PHPIMAP\ClientManager;

/**
 * Reads new mail from each Figuraid mailbox over IMAP (works with cPanel email, no server access needed).
 * Messages are only marked as read — nothing is deleted, so the mailbox stays a full copy.
 */
class MailboxPoller
{
    public function poll(string $key, int $limit = 50): array
    {
        $box = config("mailboxes.boxes.$key");
        if (! $box || ! $box['password']) {
            return ['box' => $key, 'skipped' => 'no password configured'];
        }
        $client = (new ClientManager)->make([
            'host' => config('mailboxes.host'), 'port' => config('mailboxes.port'), 'encryption' => config('mailboxes.encryption'),
            'validate_cert' => config('mailboxes.validate_cert'), 'username' => $box['address'], 'password' => $box['password'], 'protocol' => 'imap',
        ]);
        $client->connect();
        $done = 0;
        $errors = 0;
        $messages = $client->getFolder('INBOX')->query()->unseen()->leaveUnread()->limit($limit)->get();
        foreach ($messages as $msg) {
            try {
                $raw = $msg->getHeader()->raw."\r\n\r\n".$msg->getRawBody();
                app(InboundEmail::class)->process($raw, $key);
                $msg->setFlag('Seen');
                $done++;
            } catch (\Throwable $e) {
                $errors++;
                Log::error('mailbox.process_failed', ['box' => $key, 'error' => $e->getMessage()]);
            }
        }
        $client->disconnect();

        return ['box' => $key, 'processed' => $done, 'errors' => $errors];
    }
}
