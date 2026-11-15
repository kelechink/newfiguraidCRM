<?php

namespace App\Filament\Resources\Campaigns\Schemas;

use App\Models\BusinessUnit;
use App\Services\CampaignService;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Placeholder;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class CampaignForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->columns(2)->components([
            TextInput::make('name')->required(),
            Select::make('unit_id')->relationship('unit', 'name')->default(fn () => auth()->user()->primary_unit_id)->required(),
            Textarea::make('brief')->label('Brief for Seyi (what this email is about)')->rows(3)->columnSpanFull(),
            Section::make('Audience — only people who opted in to marketing email')->columns(3)->columnSpanFull()->schema([
                Select::make('audience.units')->label('Business units')->multiple()->options(fn () => BusinessUnit::pluck('name', 'id')),
                Select::make('audience.lifecycle')->label('Stage')->multiple()->options(['lead' => 'Leads', 'prospect' => 'Prospects', 'customer' => 'Customers', 'churned' => 'Churned (win-back)']),
                TagsInput::make('audience.tags')->label('Tags (any of)'),
                Placeholder::make('count')->label('Opted-in recipients right now')->content(fn ($get) => number_format(CampaignService::audience(['units' => $get('audience.units'), 'lifecycle' => $get('audience.lifecycle'), 'tags' => $get('audience.tags')])->count())),
            ]),
            TextInput::make('subject')->maxLength(190)->columnSpanFull(),
            Textarea::make('body')->rows(12)->columnSpanFull()->helperText('Use {first_name} and {company}. An unsubscribe link is added automatically.'),
            DateTimePicker::make('scheduled_at')->label('Send at (blank = as soon as approved)'),
            Hidden::make('created_by_id')->default(fn () => auth()->id()),
        ]);
    }
}
