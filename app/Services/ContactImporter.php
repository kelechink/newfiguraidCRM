<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Contact;
use Spatie\SimpleExcel\SimpleExcelReader;

/** Spreadsheet / Carrier Community list import with tagging; dedupes on email then phone. */
class ContactImporter
{
    public function import(string $path, string $unitId, array $tags, string $source, ?string $ownerId): array
    {
        $created = $updated = $skipped = 0;
        SimpleExcelReader::create($path)->getRows()->each(function (array $row) use ($unitId, $tags, $source, $ownerId, &$created, &$updated, &$skipped) {
            $r = array_change_key_case(array_map(fn ($v) => is_string($v) ? trim($v) : $v, $row));
            $email = strtolower((string) ($r['email'] ?? $r['email address'] ?? $r['e-mail'] ?? ''));
            $phone = (string) ($r['phone'] ?? $r['mobile'] ?? $r['whatsapp'] ?? $r['phone number'] ?? '');
            $name = (string) ($r['name'] ?? $r['full name'] ?? trim(($r['first name'] ?? '').' '.($r['last name'] ?? '')));
            if (! $email && ! $phone) {
                $skipped++;

                return;
            }
            if ($email && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $email = '';
            }
            $digits = preg_replace('/\D/', '', $phone);
            $e164 = $digits ? (str_starts_with($digits, '0') && strlen($digits) === 11 ? '234'.substr($digits, 1) : $digits) : null;
            $c = ($email ? Contact::where('email_normalized', $email)->first() : null) ?? ($e164 ? Contact::where('phone_e164', $e164)->first() : null);
            $companyName = (string) ($r['company'] ?? $r['organisation'] ?? $r['organization'] ?? $r['carrier'] ?? '');
            $company = $companyName ? Company::firstOrCreate(['name' => mb_substr($companyName, 0, 190)]) : null;
            $rowTags = array_filter(array_map('trim', explode(',', (string) ($r['tags'] ?? ''))));
            if ($c) {
                $c->fill(['tags' => array_values(array_unique(array_merge($c->tags ?? [], $tags, $rowTags))), 'company_id' => $c->company_id ?? $company?->id, 'phone' => $c->phone ?: ($phone ?: null)])->save();
                $updated++;
            } else {
                $c = Contact::create(['primary_unit_id' => $unitId, 'owner_id' => $ownerId, 'display_name' => mb_substr($name ?: ($email ?: $phone), 0, 160), 'email' => $email ?: null, 'phone' => $phone ?: null,
                    'company_id' => $company?->id, 'tags' => array_values(array_unique(array_merge($tags, $rowTags))), 'source_channel' => 'import', 'source_detail' => mb_substr($source, 0, 190), 'lifecycle' => 'lead']);
                $created++;
            }
            $c->units()->syncWithoutDetaching([$unitId]);
        });

        return compact('created', 'updated', 'skipped');
    }
}
