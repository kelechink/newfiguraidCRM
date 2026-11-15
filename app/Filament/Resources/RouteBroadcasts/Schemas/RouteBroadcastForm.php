<?php

namespace App\Filament\Resources\RouteBroadcasts\Schemas;

use App\Models\Carrier;
use App\Models\RateDeck;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class RouteBroadcastForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('subject')->default('Figuraid route update — '.now()->format('j M Y'))->required()->maxLength(190)->columnSpanFull(),
            Textarea::make('body')->rows(6)->required()->columnSpanFull()->default("Good day,\n\nPlease find today's routes and rates from Figuraid. Highlights:\n- \n\nReply to request a test or capacity."),
            Select::make('rate_deck_id')->label('Rates to attach (approved sell deck)')->required()
                ->options(fn () => RateDeck::where('direction', 'sell')->where('status', 'active')->pluck('name', 'id')),
            Select::make('recipient_carrier_ids')->label('Send to')->multiple()->required()
                ->options(fn () => Carrier::whereIn('role', ['customer', 'both'])->whereIn('status', ['active', 'testing'])->orderBy('name')->pluck('name', 'id')),
        ]);
    }
}
