<?php

namespace App\Services\Mail;

use ZBateson\MailMimeParser\Header\HeaderConsts;
use ZBateson\MailMimeParser\MailMimeParser;

/** A received email reduced to what the system needs (pure PHP parsing — works on shared hosting). */
final class ParsedEmail
{
    public string $messageId = '';

    public string $fromEmail = '';

    public ?string $fromName = null;

    /** @var string[] */
    public array $to = [];

    public string $subject = '';

    public string $text = '';

    public ?string $inReplyTo = null;

    /** @var array<array{name:string, mime:string, content:string}> */
    public array $attachments = [];

    public static function fromRaw(string $raw): self
    {
        $m = (new MailMimeParser)->parse($raw, false);
        $e = new self;
        $from = $m->getHeader(HeaderConsts::FROM);
        $e->fromEmail = strtolower((string) ($from?->getEmail() ?? ''));
        $e->fromName = $from?->getPersonName() ?: null;
        foreach ([HeaderConsts::TO, HeaderConsts::CC, 'Delivered-To', 'X-Original-To'] as $h) {
            $hdr = $m->getHeader($h);
            if ($hdr && method_exists($hdr, 'getAddresses')) {
                foreach ($hdr->getAddresses() as $a) {
                    $e->to[] = strtolower($a->getEmail());
                }
            } elseif ($hdr) {
                $e->to[] = strtolower(trim((string) $hdr->getValue()));
            }
        }
        $e->to = array_values(array_unique(array_filter($e->to)));
        $e->subject = mb_substr(trim((string) $m->getHeaderValue(HeaderConsts::SUBJECT)), 0, 250);
        $e->messageId = trim((string) $m->getHeaderValue(HeaderConsts::MESSAGE_ID)) ?: 'sha:'.hash('sha256', $raw);
        $e->inReplyTo = trim((string) $m->getHeaderValue(HeaderConsts::IN_REPLY_TO)) ?: null;
        $text = (string) $m->getTextContent();
        if ($text === '' && ($html = $m->getHtmlContent())) {
            $text = html_entity_decode(strip_tags(preg_replace('/<(br|\/p|\/div|\/tr)[^>]*>/i', "\n", $html)));
        }
        $e->text = self::stripQuoted($text);
        foreach ($m->getAllAttachmentParts() as $part) {
            $name = $part->getFilename() ?: 'attachment';
            $e->attachments[] = ['name' => mb_substr($name, 0, 190), 'mime' => (string) $part->getContentType(), 'content' => (string) $part->getContent()];
        }

        return $e;
    }

    /** Keep the new part of a reply, drop the quoted history below it. */
    public static function stripQuoted(string $text): string
    {
        $text = str_replace("\r\n", "\n", $text);
        $cut = preg_split('/\n(On .{5,120} wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+\nSent: )/i', $text)[0];
        $lines = array_filter(explode("\n", $cut), fn ($l) => ! str_starts_with(ltrim($l), '>'));

        return mb_substr(trim(implode("\n", $lines)), 0, 20000);
    }
}
