<?php

namespace App\Services;

use App\Models\Enrolment;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use Illuminate\Support\Str;
use RuntimeException;

/** Figure Academy certificates: unique code, PDF with a QR code pointing to the public verification page. */
class Certificates
{
    public function issue(Enrolment $e): Enrolment
    {
        if ($e->certificate_issued_at) {
            return $e;
        }
        if ($e->status !== 'completed') {
            throw new RuntimeException('Mark the enrolment as completed first.');
        }
        $owed = (float) $e->fee * (1 - (float) $e->scholarship_pct / 100) - (float) $e->amount_paid;
        if ($owed > 0.5) {
            throw new RuntimeException('Fees outstanding: ₦'.number_format($owed, 2).'.');
        }
        do {
            $code = 'FA-'.strtoupper(Str::random(4)).'-'.strtoupper(Str::random(4));
        } while (Enrolment::where('certificate_code', $code)->exists());
        $e->forceFill(['certificate_code' => $code, 'certificate_issued_at' => now()])->save();

        return $e;
    }

    public static function qrDataUri(string $url): string
    {
        return (new QRCode(new QROptions(['outputType' => QRCode::OUTPUT_IMAGE_PNG, 'scale' => 6, 'imageBase64' => true])))->render($url);
    }

    public function pdf(Enrolment $e): string
    {
        $e->loadMissing(['contact', 'cohort.course']);
        $url = route('certificate.verify', $e->certificate_code);

        return \Barryvdh\DomPDF\Facade\Pdf::loadView('pdf.certificate', ['e' => $e, 'url' => $url, 'qr' => self::qrDataUri($url)])->setPaper('a4', 'landscape')->output();
    }
}
