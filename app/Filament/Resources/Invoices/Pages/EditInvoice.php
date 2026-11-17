<?php

namespace App\Filament\Resources\Invoices\Pages;

use App\Filament\Resources\Invoices\InvoiceResource;
use App\Services\InvoiceService;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\Mail;

class EditInvoice extends EditRecord
{
    protected static string $resource = InvoiceResource::class;

    protected function afterSave(): void
    {
        InvoiceService::recalc($this->record);
    }

    protected function getHeaderActions(): array
    {
        $r = $this->record;

        return [
            Action::make('link')->label($r->kind === 'quote' ? 'Copy signing link' : 'Customer link')->icon('heroicon-o-link')->color('gray')
                ->modalContent(fn () => new \Illuminate\Support\HtmlString('<p style="word-break:break-all">'.e(route('quote.show', $r->public_token)).'</p>'))->modalSubmitAction(false),
            Action::make('pdf')->label('PDF')->icon('heroicon-o-document-arrow-down')->color('gray')
                ->action(fn () => response()->streamDownload(fn () => print(\Barryvdh\DomPDF\Facade\Pdf::loadView('pdf.invoice', ['q' => $r->load('lines', 'unit', 'contact', 'carrier')])->output()), "$r->number.pdf")),
            Action::make('send')->label('Email to customer')->icon('heroicon-o-envelope')->requiresConfirmation()
                ->visible(fn () => (bool) ($r->contact?->email))
                ->action(function () use ($r) {
                    Mail::raw("Hello,\n\nPlease find your ".($r->kind === 'quote' ? 'quote' : 'invoice')." {$r->number} for {$r->currency} ".number_format($r->total, 2).".\nView".($r->kind === 'quote' ? ' and sign' : '').": ".route('quote.show', $r->public_token)."\n\nFiguraid", fn ($m) => $m->to($r->contact->email)->subject(($r->kind === 'quote' ? 'Quote ' : 'Invoice ').$r->number)->from(config('mailboxes.send_as.invoices'), 'Figuraid Billing')->replyTo(config('mailboxes.send_as.invoices')));
                    if ($r->status === 'draft') {
                        $r->forceFill(['status' => 'sent'])->save();
                    }
                }),
            DeleteAction::make(),
        ];
    }
}
