<?php

namespace App\Filament\Resources\Carriers\Pages;

use App\Filament\Resources\Carriers\CarrierResource;
use App\Services\CarrierBilling;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\HtmlString;

class EditCarrier extends EditRecord
{
    protected static string $resource = CarrierResource::class;

    protected function getHeaderActions(): array
    {
        $c = $this->record;

        return [
            Action::make('topup')->label('Record top-up')->icon('heroicon-o-plus-circle')->color('success')
                ->visible(fn () => $c->billing_mode === 'prepaid' && auth()->user()->canDo('telecom.prepaid', 'edit'))
                ->schema([TextInput::make('amount')->label("Amount ({$c->currency})")->numeric()->minValue(0.01)->required(), TextInput::make('reference')->label('Payment reference / bank narration')->required()])
                ->action(function (array $data) use ($c) {
                    app(CarrierBilling::class)->topUp($c, (float) $data['amount'], $data['reference'], auth()->user());
                    Notification::make()->title('Balance now '.$c->currency.' '.number_format((float) $c->fresh()->prepaid_balance, 2))->success()->send();
                    $this->redirect(CarrierResource::getUrl('edit', ['record' => $c]));
                }),
            Action::make('ledger')->label('Prepaid ledger')->color('gray')->icon('heroicon-o-list-bullet')->visible(fn () => $c->billing_mode === 'prepaid')
                ->modalSubmitAction(false)->modalContent(fn () => new HtmlString('<table style="width:100%;font-size:13px">'.DB::table('prepaid_ledger')->where('carrier_id', $c->id)->orderByDesc('id')->limit(40)->get()
                    ->map(fn ($r) => '<tr><td>'.e($r->date).'</td><td>'.e($r->kind).'</td><td style="text-align:right">'.number_format($r->amount, 2).'</td><td style="text-align:right">'.number_format($r->balance_after, 2).'</td><td>'.e($r->reference).'</td></tr>')->implode('').'</table>')),
            DeleteAction::make(),
        ];
    }
}
