<?php

namespace App\Filament\Resources\Carriers\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Placeholder;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class CarrierForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->columns(2)->components([
            Section::make('Carrier')->columns(3)->columnSpanFull()->schema([
                TextInput::make('name')->required(),
                Select::make('role')->options(['customer' => 'Customer (we bill them)', 'vendor' => 'Vendor (they bill us)', 'both' => 'Both'])->required(),
                TextInput::make('country'),
                Select::make('status')->options(['testing' => 'Testing', 'active' => 'Active', 'suspended' => 'Suspended', 'closed' => 'Closed'])->default('testing')->required(),
                Select::make('kyc_status')->label('KYC')->options(['pending' => 'Pending', 'verified' => 'Verified', 'rejected' => 'Rejected'])->default('pending')->required(),
                Select::make('account_manager_id')->relationship('accountManager', 'name')->searchable()->preload(),
                Select::make('contact_id')->relationship('contact', 'display_name')->searchable(),
                TextInput::make('rate_email')->email()->label('Rate-sheet sender email'),
            ]),
            Section::make('Billing')->columns(3)->columnSpanFull()->schema([
                Select::make('currency')->options(['USD' => 'USD', 'EUR' => 'EUR', 'GBP' => 'GBP', 'NGN' => 'NGN'])->default('USD')->required(),
                Select::make('billing_mode')->options(['prepaid' => 'Prepaid (recommended for new carriers)', 'postpaid' => 'Postpaid (credit limit)'])->default('prepaid')->required(),
                Select::make('billing_cycle')->label('Cycle / payment days')->options(['7/3' => '7/3 weekly', '7/4' => '7/4 weekly', '15/5' => '15/5', '30/15' => '30/15 monthly'])->default('7/3')->required(),
                DatePicker::make('cycle_anchor')->label('First cycle starts')->helperText('Defaults to the day the carrier was added.'),
                TextInput::make('increment_first')->numeric()->default(60)->required(),
                TextInput::make('increment_next')->numeric()->default(60)->required(),
                TextInput::make('credit_limit')->numeric()->default(0)->helperText('Postpaid: warns at 80%, flags at 100%.'),
                TextInput::make('low_balance_threshold')->numeric()->default(0)->helperText('Prepaid: warn when the balance falls below this.'),
                Placeholder::make('balance')->label('Prepaid balance')->content(fn ($record) => $record ? $record->currency.' '.number_format((float) $record->prepaid_balance, 2).($record->suspended_at ? ' — SUSPEND on switch' : '') : '—'),
            ]),
            Textarea::make('notes')->columnSpanFull(),
        ]);
    }
}
